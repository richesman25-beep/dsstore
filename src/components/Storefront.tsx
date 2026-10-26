import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Gift, MapPin, Package, Search, ShoppingBag, SlidersHorizontal, Sparkles, Sun, Tag, Truck, X } from 'lucide-react'
import type { Catalog, Lang, Product } from '../types'
import { money, productPrice } from '../lib/rules'
import './storefront.css'

interface Props {
  catalog: Catalog
  lang: Lang
  onAdd: (product: Product) => void
  onProduct: (product: Product) => void
  search: string
  onSearch: (value: string) => void
  onTrack: () => void
  onDelivery: () => void
}

type Filter = 'all' | 'new' | 'promo' | 'popular' | 'budget' | 'special'
type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name'
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Storefront({ catalog, lang, onAdd, onProduct, search, onSearch, onTrack, onDelivery }: Props) {
  const t = (fr: string, ht: string) => lang === 'fr' ? fr : ht
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('featured')
  const [stockOnly, setStockOnly] = useState(false)
  useEffect(() => {
    const resetFilters = () => { setCategory('all'); setFilter('all'); setStockOnly(false) }
    window.addEventListener('dsstore:global-search', resetFilters)
    return () => window.removeEventListener('dsstore:global-search', resetFilters)
  }, [])
  const activeZones = catalog.zones.filter(zone => zone.active)
  const activePromotions = catalog.promotions.filter(p => p.active && Date.parse(p.starts_at) <= Date.now() && Date.parse(p.ends_at) > Date.now())
  const filterLabels: Record<Filter, string> = {
    all: t('Pour vous', 'Pou ou'),
    new: t('Nouveautés', 'Nouvo'),
    promo: t('Promotions', 'Pwomosyon'),
    popular: t('Populaires', 'Popilè'),
    budget: t('Petits prix', 'Ti pri'),
    special: t('Offres spéciales', 'Òf espesyal'),
  }
  const filterTitles: Record<Filter, string> = {
    all: t('Les trouvailles du moment.', 'Bèl dekouvèt moman an.'),
    new: t('Tout nouveau aux Cayes.', 'Tou nèf nan Okay.'),
    promo: t('Les bons plans de la semaine.', 'Bon plan semèn nan.'),
    popular: t('La sélection qui fait plaisir.', 'Seleksyon ki fè kè w kontan.'),
    budget: t('Petits prix, grands sourires.', 'Ti pri, gwo souri.'),
    special: t('Un petit plus, rien que pour vous.', 'Yon ti plis, jis pou ou.'),
  }
  const products = useMemo(() => {
    const needle = normalize(search.trim())
    return catalog.products.filter(p => {
      if (!p.active || (stockOnly && p.stock <= 0)) return false
      if (category !== 'all' && p.category_id !== category) return false
      if (needle && !normalize(`${p.name_fr} ${p.name_ht} ${p.description_fr} ${p.description_ht}`).includes(needle)) return false
      if (filter === 'new' && !p.is_new) return false
      if (filter === 'popular' && !p.featured) return false
      if (filter === 'budget' && productPrice(p) > 1500) return false
      if (filter === 'promo' && productPrice(p) >= p.price) return false
      if (filter === 'special' && !activePromotions.length && productPrice(p) >= p.price) return false
      return true
    }).sort((a, b) => {
      if (sort === 'price-asc') return productPrice(a) - productPrice(b)
      if (sort === 'price-desc') return productPrice(b) - productPrice(a)
      if (sort === 'name') return (lang === 'fr' ? a.name_fr : a.name_ht).localeCompare(lang === 'fr' ? b.name_fr : b.name_ht)
      return Number(b.featured) - Number(a.featured)
    })
  }, [catalog.products, category, filter, lang, search, sort, stockOnly, activePromotions.length])
  const goToProducts = () => document.getElementById('sf-products')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  const chooseFilter = (value: Filter) => { setFilter(value); setCategory('all'); onSearch(''); setStockOnly(false); goToProducts() }
  const chooseCategory = (id: string) => { setCategory(id); setFilter('all'); onSearch(''); setStockOnly(false); goToProducts() }
  const selectedCategory = catalog.categories.find(c => c.id === category)
  const heading = search ? t('On a cherché pour vous.', 'Nou chèche pou ou.') : selectedCategory ? (lang === 'fr' ? selectedCategory.name_fr : selectedCategory.name_ht) : filterTitles[filter]

  return <div className={`sf-main ${lang === 'ht' ? 'sf-creole' : ''}`}>
    <section className="sf-hero" aria-labelledby="sf-hero-title">
      <div className="sf-hero-copy">
        <p className="sf-eyebrow"><span/>{t('LA BOUTIQUE DU GRAND SUD', 'BOUTIK GRAN SID LA')}</p>
        <h1 id="sf-hero-title">{t('Un peu de tout.', 'Yon ti jan de tout.')}<br/>{t('Beaucoup', 'Anpil bèl bagay')}<br/><em>{t('pour vous.', 'pou ou.')}</em><span className="sf-title-spark" aria-hidden="true"><Sun size={49} strokeWidth={1.6}/></span></h1>
        <p className="sf-hero-description">{t('Les essentiels du quotidien, les petites envies et les bonnes trouvailles. Votre boutique aux Cayes, tout simplement.', 'Sa w bezwen chak jou, sa w renmen ak bèl ti dekouvèt. Boutik ou nan Okay, tou senpleman.')}</p>
        <div className="sf-hero-actions">
          <button className="sf-button sf-button-coral" onClick={() => chooseFilter('all')}>{t('Explorer la boutique', 'Dekouvri boutik la')}<ArrowUpRight size={20}/></button>
          <button className="sf-hero-secondary" onClick={() => chooseFilter('promo')}>{t('Voir les bons plans', 'Gade bon plan yo')}<ArrowRight size={18}/></button>
        </div>
        <div className="sf-hero-reassurance"><span><Check size={15}/>{t('Des prix en gourdes', 'Pri yo an goud')}</span><span><Check size={15}/>{t('Sans compte obligatoire', 'Pa bezwen kont')}</span></div>
      </div>
      <div className="sf-hero-art">
        <div className="sf-photo-backdrop"/>
        <img className="sf-hero-photo" src="/images/hero-shopping.webp" alt={t('Une femme souriante fait ses achats pour le quotidien', 'Yon fanm k ap souri pandan l ap achte sa li bezwen chak jou')} width="1200" height="800" fetchPriority="high" onError={e => { if (!e.currentTarget.src.endsWith('/images/hero.svg')) e.currentTarget.src = '/images/hero.svg' }}/>
        <span className="sf-photo-sun" aria-hidden="true"><Sun size={47} strokeWidth={1.5}/></span>
        <div className="sf-hello-sticker"><span>{t('Bonjou,', 'Bonjou,')}</span><strong>{t('le Sud !', 'Gran Sid!')}</strong><Sparkles size={20}/></div>
        <div className="sf-hero-slogan"><span className="sf-slogan-icon"><ShoppingBag size={23}/></span><span>Tout sa w bezwen,<br/><strong>pi pre w.</strong></span><span className="sf-slogan-heart" aria-hidden="true">♡</span></div>
      </div>
    </section>

    <div className="sf-perks" aria-label={t('Les petits plus DS STORE', 'Ti plis DS STORE yo')}>
      <div><span className="sf-perk-icon sf-perk-yellow"><Tag size={22}/></span><span><b>{t('En gourdes. En toute simplicité.', 'An goud. Tou senpleman.')}</b><small>{t('Les prix sont clairs, les envies aussi.', 'Pri yo klè, chwa a fasil.')}</small></span></div>
      <button onClick={onDelivery}><span className="sf-perk-icon sf-perk-peach"><Truck size={23}/></span><span><b>{t('On est tout près.', 'Nou toupre ou.')}</b><small>{activeZones.length ? t('Voir les zones de livraison actives', 'Gade zòn livrezon ki aktive yo') : t('Découvrir la livraison et le retrait', 'Dekouvri livrezon ak ranmasaj')}</small></span><ArrowUpRight size={18}/></button>
      <button onClick={onTrack}><span className="sf-perk-icon sf-perk-pink"><Package size={22}/></span><span><b>{t('Votre commande, pas à pas.', 'Kòmand ou, etap pa etap.')}</b><small>{t('Retrouvez le suivi de votre commande.', 'Jwenn swivi kòmand ou a.')}</small></span><ArrowUpRight size={18}/></button>
    </div>

    <section className="sf-category-section" aria-labelledby="sf-categories-title">
      <div className="sf-section-heading"><div><span className="sf-kicker">{t('À CHAQUE ENVIE, SON RAYON', 'POU CHAK ANVI, GEN YON RAYON')}</span><h2 id="sf-categories-title">{t('Qu’est-ce qui vous ferait plaisir ?', 'Kisa ki ta fè w plezi?')}</h2></div><span className="sf-section-doodle" aria-hidden="true"><Sparkles size={28}/></span></div>
      <div role="group" aria-label={t('Catégories', 'Kategori')} className="sf-category-group">
        <div className="sf-category-grid">{catalog.categories.map((c, index) => {
          const image = catalog.products.find(p => p.category_id === c.id && p.active)?.image_url
          return <button key={c.id} className={`sf-category-card sf-category-color-${index % 5} ${category === c.id ? 'sf-category-selected' : ''}`} onClick={() => chooseCategory(c.id)} aria-label={lang === 'fr' ? c.name_fr : c.name_ht} aria-pressed={category === c.id}>
            <span className="sf-category-image">{image ? <img src={image} alt="" loading="lazy" width="350" height="250"/> : <ShoppingBag size={55} strokeWidth={1.3}/>}</span>
            <span className="sf-category-name">{lang === 'fr' ? c.name_fr : c.name_ht}<ArrowUpRight size={19}/></span>
          </button>
        })}</div>
        <button className="sf-explore-all" onClick={() => chooseCategory('all')} aria-pressed={category === 'all'}>{t('Tout explorer', 'Gade tout')}<ArrowRight size={16}/></button>
      </div>
    </section>

    <section className="sf-deal-strip" aria-label={t('Promotions de la semaine', 'Pwomosyon semèn nan')}>
      <span className="sf-deal-sticker" aria-hidden="true">%</span>
      <div className="sf-deal-copy"><span className="sf-kicker">{t('ON AIME LES BONNES SURPRISES', 'NOU RENMEN BÈL SIPRIZ')}</span><h2>{t('Le plaisir des petits prix.', 'Plezi ti pri yo.')}</h2><p>{t('De quoi se faire plaisir, sans en faire trop.', 'Fè tèt ou plezi, san depanse twòp.')}</p></div>
      <button className="sf-button sf-button-dark" onClick={() => chooseFilter('promo')}>{t('Les promotions de la semaine', 'Pwomosyon semèn nan')}<ArrowUpRight size={19}/></button>
      <Sun className="sf-deal-sun" size={130} strokeWidth={1} aria-hidden="true"/>
    </section>

    <section className="sf-shop-section" id="sf-products" aria-labelledby="sf-catalog-title">
      <div className="sf-section-heading sf-products-heading"><div><span className="sf-kicker">{t('LE BON PRODUIT, LA BONNE ENVIE', 'BON PWODWI A, BON ANVI A')}</span><h2 id="sf-catalog-title">{heading}</h2><p>{filter === 'budget' ? t('Notre sélection à 1 500 G ou moins.', 'Seleksyon nou an pou 1 500 G oswa pi ba.') : search ? `${products.length} ${t('résultat(s) pour', 'rezilta pou')} « ${search} »` : t('Des essentiels aux petites envies, trouvez votre bonheur.', 'Soti nan sa ki esansyèl rive nan sa w renmen, jwenn sa k fè w plezi.')}</p></div><span className="sf-product-count">{products.length} {t(products.length === 1 ? 'produit' : 'produits', 'pwodwi')}</span></div>
      <div className="sf-filter-tabs" role="group" aria-label={t('Sélections commerciales', 'Seleksyon boutik la')}>
        {(['all', 'new', 'promo', 'popular', 'budget', 'special'] as Filter[]).map(value => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`sf-filter ${filter === value ? 'sf-filter-active' : ''}`}>{value === 'new' ? <Sparkles size={16}/> : value === 'promo' ? <Tag size={16}/> : value === 'special' ? <Gift size={16}/> : value === 'budget' ? <span className="sf-small-price" aria-hidden="true">G</span> : null}{filterLabels[value]}</button>)}
      </div>
      <div className="sf-product-tools">
        <label className="sf-search"><Search size={20}/><span className="sf-sr-only">{t('Rechercher un produit', 'Chèche yon pwodwi')}</span><input type="search" placeholder={t('Qu’est-ce qu’on vous trouve ?', 'Kisa n ap jwenn pou ou?')} value={search} onChange={e => onSearch(e.target.value)}/>{search && <button onClick={() => onSearch('')} aria-label={t('Effacer la recherche', 'Efase rechèch la')}><X size={18}/></button>}</label>
        <label className="sf-stock-filter"><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)}/>{t('En stock uniquement', 'Sa ki nan stok sèlman')}</label>
        <label className="sf-sort"><SlidersHorizontal size={17}/><span className="sf-sr-only">{t('Trier les produits', 'Klase pwodwi yo')}</span><select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="featured">{t('Notre sélection', 'Seleksyon nou')}</option><option value="price-asc">{t('Prix croissant', 'Pri pi ba an premye')}</option><option value="price-desc">{t('Prix décroissant', 'Pri pi wo an premye')}</option><option value="name">{t('Nom : A à Z', 'Non: A rive Z')}</option></select><ChevronDown size={16}/></label>
      </div>
      {filter === 'special' && activePromotions.length > 0 && <div className="sf-promotion-codes"><p><Gift size={19}/>{t('Un petit cadeau à saisir à la commande :', 'Yon ti kado pou antre lè w ap kòmande:')}</p>{activePromotions.map(p => <span key={p.id}>{lang === 'fr' ? p.title_fr : p.title_ht}<b>{p.code}</b><strong>−{p.discount_percent}%</strong></span>)}</div>}
      {products.length ? <div className="sf-product-grid">{products.map((p, index) => {
        const discounted = productPrice(p) < p.price
        const productCategory = catalog.categories.find(c => c.id === p.category_id)
        return <article className="sf-product" key={p.id}>
          <div className={`sf-product-visual sf-product-tone-${index % 4}`}>
            <button onClick={() => onProduct(p)} className="sf-product-image-button" aria-label={t(`Voir ${p.name_fr}`, `Gade ${p.name_ht}`)}><img src={p.image_url || '/images/backpack.svg'} alt={lang === 'fr' ? p.name_fr : p.name_ht} width="600" height="500" loading="lazy" decoding="async" onError={e => { if (!e.currentTarget.src.endsWith('/images/backpack.svg')) e.currentTarget.src = '/images/backpack.svg' }}/></button>
            <div className="sf-product-badges">{discounted ? <span className="sf-badge sf-sale">−{Math.round((1 - productPrice(p) / p.price) * 100)}%</span> : p.is_new ? <span className="sf-badge sf-new">{t('Tout nouveau', 'Tou nèf')}</span> : null}{p.stock <= 0 && <span className="sf-badge sf-out">{t('Épuisé', 'Fini')}</span>}</div>
            <button className="sf-quick-view" onClick={() => onProduct(p)} aria-label={t(`Détails de ${p.name_fr}`, `Detay ${p.name_ht}`)}><ArrowUpRight size={20}/></button>
          </div>
          <div className="sf-product-body"><span className="sf-product-category">{lang === 'fr' ? productCategory?.name_fr : productCategory?.name_ht}</span><button className="sf-product-name" onClick={() => onProduct(p)}><h3>{lang === 'fr' ? p.name_fr : p.name_ht}</h3></button><div className="sf-product-bottom"><div className="sf-product-prices"><strong>{money(productPrice(p))}</strong>{discounted && <del>{money(p.price)}</del>}</div><button className="sf-add" onClick={() => onAdd(p)} disabled={p.stock <= 0} aria-label={t(`Ajouter ${p.name_fr} au panier`, `Mete ${p.name_ht} nan panye`)}><ShoppingBag size={18}/><span>{t('Ajouter', 'Ajoute')}</span></button></div></div>
        </article>
      })}</div> : <div className="sf-empty"><span><Search size={34}/></span><h3>{t('On n’a pas encore trouvé…', 'Nou poko jwenn li…')}</h3><p>{t('Un autre mot, une autre catégorie ? Votre prochaine trouvaille est peut-être juste à côté.', 'Yon lòt mo, yon lòt kategori? Pwochen bèl dekouvèt ou a ka toupre.')}</p><button className="sf-button sf-button-coral" onClick={() => { onSearch(''); setCategory('all'); setFilter('all'); setStockOnly(false) }}>{t('Voir tous les produits', 'Gade tout pwodwi yo')}<ArrowRight size={18}/></button></div>}
      {products.length > 0 && <p className="sf-catalog-end"><span/>{t('Vous avez fait le tour de notre sélection.', 'Ou fin fè tou seleksyon nou an.')}<Sun size={16}/><span/></p>}
    </section>

    <section className="sf-local-section" aria-labelledby="sf-local-title">
      <div className="sf-local-copy"><span className="sf-kicker"><MapPin size={15}/>{t('D’ICI, AVEC LE SOURIRE', 'LAKAY, AK YON SOURI')}</span><h2 id="sf-local-title">{t('Votre quotidien.', 'Chak jou w.')}<br/><em>{t('Un peu plus près.', 'Yon ti jan pi pre.')}</em></h2><p>{t('Une boutique née aux Cayes, pensée pour les gens d’ici. De la première envie au suivi de votre commande, on fait simple.', 'Yon boutik ki fèt Okay, pou moun lakay nou. Depi premye anvi a rive nan swivi kòmand ou a, nou fè sa fasil.')}</p><span className="sf-local-signature">Tout sa w bezwen, pi pre w.<Sun size={21}/></span></div>
      <div className="sf-local-actions"><button onClick={onDelivery}><span className="sf-local-action-icon"><Truck size={26}/></span><span><strong>{t('Livraison ou retrait ?', 'Livrezon oswa ranmasaj?')}</strong><small>{activeZones.length ? t('Consultez nos zones et nos conditions.', 'Gade zòn ak kondisyon nou yo.') : t('Découvrez les services et leur disponibilité.', 'Dekouvri sèvis yo ak disponiblite yo.')}</small></span><ArrowUpRight size={23}/></button><button onClick={onTrack}><span className="sf-local-action-icon sf-action-yellow"><Package size={25}/></span><span><strong>{t('Des nouvelles de votre commande.', 'Nouvèl kòmand ou a.')}</strong><small>{t('Avec votre référence et votre clé privée.', 'Avèk referans ou ak kle prive ou.')}</small></span><ArrowUpRight size={23}/></button><p><Check size={16}/>{t('Les services disponibles sont précisés à la commande.', 'Sèvis ki disponib yo parèt lè w ap kòmande.')}</p></div>
    </section>
  </div>
}
