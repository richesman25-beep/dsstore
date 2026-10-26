// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { getAdminData, resetDemo, savePayment, saveSettings } from '../src/lib/api'

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
})

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  resetDemo()
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function openShop() {
  const app = render(<App/>)
  await screen.findByRole('button', { name: 'Ajouter Ventilateur rechargeable au panier' })
  return app
}

describe('storefront interactions', () => {
  it('searches without accents and combines real category and budget filters', async () => {
    const user = userEvent.setup()
    await openShop()
    const search = screen.getByRole('searchbox', { name: 'Rechercher un produit' })
    await user.type(search, 'ecouteurs')
    expect(screen.getByRole('button', { name: 'Ajouter Écouteurs sans fil au panier' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ajouter Ventilateur rechargeable au panier' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
    await user.click(within(screen.getByRole('group', { name: 'Catégories' })).getByRole('button', { name: 'Alimentation' }))
    expect(screen.getByRole('button', { name: 'Ajouter Riz de qualité · 5 kg au panier' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ajouter Écouteurs sans fil au panier' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Tout explorer' }))
    await user.click(screen.getByRole('button', { name: 'Petits prix' }))
    expect(screen.getByRole('button', { name: 'Ajouter Soin hydratant naturel au panier' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ajouter Riz de qualité · 5 kg au panier' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Ajouter .+ au panier$/ })).toHaveLength(2)
  })

  it('searches the whole shop from the header after selecting a category', async () => {
    const user = userEvent.setup()
    await openShop()
    await user.click(within(screen.getByRole('group', { name: 'Catégories' })).getByRole('button', { name: 'Alimentation' }))
    expect(screen.queryByRole('button', { name: 'Ajouter Écouteurs sans fil au panier' })).toBeNull()
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans la boutique' }), 'ecouteurs')
    expect(screen.getByRole('button', { name: 'Ajouter Écouteurs sans fil au panier' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ajouter Riz de qualité · 5 kg au panier' })).toBeNull()
  })

  it('switches all shopping controls to Haitian Creole and remembers that choice', async () => {
    const user = userEvent.setup()
    const app = await openShop()
    await user.click(screen.getByRole('button', { name: 'Passer en créole haïtien' }))
    expect(screen.getByRole('searchbox', { name: 'Chèche yon pwodwi' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mete Vantilatè rechajab nan panye' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('ht')
    expect(localStorage.getItem('dsstore:lang')).toBe('ht')
    app.unmount()
    render(<App/>)
    await screen.findByRole('button', { name: 'Mete Vantilatè rechajab nan panye' })
    expect(screen.getByRole('button', { name: 'Pase an franse' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Pase an franse' }))
    expect(screen.getByRole('searchbox', { name: 'Rechercher un produit' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('fr')
  })

  it('adds products, updates quantities, persists the cart and removes an item', async () => {
    const user = userEvent.setup()
    const app = await openShop()
    await user.click(screen.getByRole('button', { name: 'Ajouter Ventilateur rechargeable au panier' }))
    await user.click(screen.getByRole('button', { name: 'Panier (1)' }))
    const cart = screen.getByRole('dialog', { name: 'Mon panier (1)' })
    await user.click(within(cart).getByRole('button', { name: 'Augmenter la quantité' }))
    expect(screen.getByRole('dialog', { name: 'Mon panier (2)' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('dsstore:cart:v1')!)).toEqual([{ product_id: 'demo-fan', quantity: 2 }])
    await user.click(within(cart).getByRole('button', { name: 'Réduire la quantité' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    app.unmount()
    render(<App/>)
    await screen.findByRole('button', { name: 'Panier (1)' })
    await user.click(screen.getByRole('button', { name: 'Panier (1)' }))
    const restored = await screen.findByRole('dialog', { name: 'Mon panier (1)' })
    expect(within(restored).getByText('Ventilateur rechargeable')).toBeTruthy()
    await user.click(within(restored).getByRole('button', { name: 'Supprimer cet article' }))
    expect(within(restored).getByRole('heading', { name: 'De belles trouvailles vous attendent.' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('dsstore:cart:v1')!)).toEqual([])
  })
})

describe('administration and guest checkout', () => {
  it('saves editable contact and pickup details through the admin form and exposes the WhatsApp link', async () => {
    const user = userEvent.setup()
    await openShop()
    await user.click(screen.getByRole('button', { name: 'Configurer la démo' }))
    const nav = await screen.findByRole('navigation', { name: 'Administration' })
    await user.click(within(nav).getByRole('button', { name: 'Boutique' }))
    await user.type(screen.getByRole('textbox', { name: /^Numéro WhatsApp/ }), '+509 34 12 56 78')
    await user.type(screen.getByRole('textbox', { name: 'Adresse de retrait aux Cayes' }), 'Adresse fictive, rue du Test aux Cayes')
    await user.type(screen.getByRole('textbox', { name: /^Horaires de retrait/ }), 'Lundi au vendredi, 9 h à 16 h')
    await user.click(screen.getByRole('checkbox', { name: 'Autoriser le retrait en boutique' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('Modifications enregistrées.')
    const saved = (await getAdminData()).settings
    expect(saved.whatsapp).toBe('50934125678')
    expect(saved.pickup_enabled).toBe(true)
    expect(JSON.parse(localStorage.getItem('dsstore:demo:v1')!).settings).toEqual(saved)
    await user.click(screen.getByRole('button', { name: 'Voir la boutique' }))
    const contact = await screen.findByRole('link', { name: 'WhatsApp' })
    expect(contact.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/50934125678\?text=/)
    await user.click(screen.getByRole('button', { name: 'Livraison & retrait' }))
    const delivery = screen.getByRole('dialog', { name: 'Livraison & retrait' })
    expect(within(delivery).getByText(/Adresse fictive, rue du Test aux Cayes/)).toBeTruthy()
    expect(within(delivery).getByText(/Les livraisons ne sont pas encore ouvertes/)).toBeTruthy()
  })

  it('creates a simulated guest pickup order and follows it with its private receipt key', async () => {
    const data = await getAdminData()
    await saveSettings({ ...data.settings, pickup_enabled: true, pickup_address: 'Point de retrait fictif aux Cayes', pickup_hours: 'Lundi au vendredi, 9 h à 16 h' })
    await savePayment({ ...data.payments.find(p => p.id === 'cod')!, enabled: true, configured: true, validated: true, instructions: 'Payer en gourdes au retrait de test.' })
    const user = userEvent.setup()
    await openShop()
    await user.click(screen.getByRole('button', { name: 'Ajouter Ventilateur rechargeable au panier' }))
    await user.click(screen.getByRole('button', { name: 'Panier (1)' }))
    await user.click(screen.getByRole('button', { name: 'Tester ma commande' }))
    const checkout = screen.getByRole('dialog', { name: 'Finaliser ma commande' })
    const name = await within(checkout).findByRole('textbox', { name: 'Nom complet' })
    expect((within(checkout).getByRole('radio', { name: 'Retrait aux Cayes' }) as HTMLInputElement).checked).toBe(true)
    expect((within(checkout).getByRole('radio', { name: /MonCash/ }) as HTMLInputElement).disabled).toBe(true)
    await user.type(name, 'Cliente Fictive')
    await user.type(within(checkout).getByRole('textbox', { name: /^Téléphone haïtien/ }), '34125678')
    await user.type(within(checkout).getByRole('textbox', { name: 'Code promotionnel' }), 'DEMO10')
    await user.click(within(checkout).getByRole('button', { name: 'Simuler la commande' }))
    await within(checkout).findByRole('heading', { name: 'Ton essai est prêt.' })
    expect(within(checkout).getByText(/Aucun achat ni paiement réel/)).toBeTruthy()
    const orders = (await getAdminData()).orders
    expect(orders).toHaveLength(1)
    expect(orders[0].reference).toMatch(/^DEMO-/)
    expect(orders[0].fulfillment).toBe('pickup')
    expect(orders[0].total).toBe(3555)
    expect(JSON.parse(localStorage.getItem('dsstore:cart:v1')!)).toEqual([])
    await user.click(within(checkout).getByRole('button', { name: 'Suivre la commande' }))
    const tracking = screen.getByRole('dialog', { name: 'Suivre ma commande' })
    const reference = await within(tracking).findByRole('textbox', { name: 'Référence de commande' })
    expect((reference as HTMLInputElement).value).toBe(orders[0].reference)
    await user.click(within(tracking).getByRole('button', { name: 'Afficher le suivi' }))
    await waitFor(() => expect(within(tracking).getAllByText('Commande reçue').length).toBeGreaterThan(0))
    expect(within(tracking).queryByText('Cliente Fictive')).toBeNull()
    expect(within(tracking).getByText('1 × Ventilateur rechargeable')).toBeTruthy()
  })
})
