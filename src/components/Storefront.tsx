import { useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, Box, Check, ChevronDown, Headphones, Heart, Home, MapPin, Package, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Sparkles, Tag, Truck, Utensils, X, Zap } from 'lucide-react'
import type { Catalog, Lang, Product } from '../types'
import { productPrice as priceOf } from '../lib/rules'
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
const money = (value: number, lang: Lang) => `${new Intl.NumberFormat(lang === 'fr' ? 'fr-HT' : 'fr-HT', { maximumFractionDigits: 2 }).format(value)} G`
function CategoryIcon({ slug, size = 18 }: { slug: string; size?: number }) {
  const name = normalize(slug)
  if (/electron|tech|teleph|phone/.test(name)) return <Headphones size={size}/>
  if (/maison|home|menaj/.test(name)) return <Home size={size}/>
  if (/mode|vetem|fashion|access/.test(name)) return <ShoppingBag size={size}/>
  if (/alim|epic|grocer|manje/.test(name)) return <Utensils size={size}/>
  if (/beaute|beauty|swen/.test(name)) return <Heart size={size}/>
  return <Box size={size}/>
}

export default function Storefront({ catalog, lang, onAdd, onProduct, search, onSearch, onTrack, onDelivery }: Props) {
  const t = (fr: string, ht: string) => lang === 'fr' ? fr : ht
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('featured')
  const [stockOnly, setStockOnly] = useState(false)
  const activeZones = catalog.zones.filter(zone => zone.active)
  const activePromotions = catalog.promotions.filter(p => p.active && Date.parse(p.starts_at) <= Date.now() && Date.parse(p.ends_at) > Date.now())
  const filterLabels: Record<Filter, string> = {
    all: t('Tous les produits', 'Tout pwodwi yo'),
    new: t('Nouveautés aux Cayes', 'Nouvo nan Okay'),
    promo: t('Promotions de la semaine', 'Pwomosyon semèn nan'),
    popular: t('Produits populaires', 'Pwodwi popilè'),
    budget: t('Petits prix', 'Ti pri'),
    special: t('Offres spéciales', 'Òf espesyal'),
  }
  const products = useMemo(() => {
    const needle = normalize(search.trim())
    const filtered = catalog.products.filter(p => {
      if (!p.active || (stockOnly && p.stock <= 0)) return false
      if (category !== 'all' && p.category_id !== category) return false
      if (needle && !normalize(`${p.name_fr} ${p.name_ht} ${p.description_fr} ${p.description_ht}`).includes(needle)) return false
      if (filter === 'new' && !p.is_new) return false
      if (filter === 'popular' && !p.featured) return false
      if (filter === 'budget' && priceOf(p) > 1500) return false
      if (filter === 'promo' && priceOf(p) >= p.price) return false
      if (filter === 'special' && !activePromotions.length && priceOf(p) >= p.price) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return priceOf(a) - priceOf(b)
      if (sort === 'price-desc') return priceOf(b) - priceOf(a)
      if (sort === 'name') return (lang === 'fr' ? a.name_fr : a.name_ht).localeCompare(lang === 'fr' ? b.name_fr : b.name_ht)
      return Number(b.featured) - Number(a.featured)
    })
  }, [catalog.products, category, filter, lang, search, sort, stockOnly, activePromotions.length])
  const goToProducts = () => document.getElementById('sf-products')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  const chooseFilter = (value: Filter) => { setFilter(value); setCategory('all'); onSearch(''); goToProducts() }
  const selectedCategory = catalog.categories.find(c => c.id === category)

  return <div className="sf-main">
    <section className="sf-hero" aria-labelledby="sf-hero-title">
      <div className="sf-hero-copy">
        <div className="sf-eyebrow"><span className="sf-location-dot"/><MapPin size={13}/>{t('LES CAYES · GRAND SUD, HAÏTI', 'OKAY · GRAN SID, AYITI')}</div>
        <h1 id="sf-hero-title">{t('Le quotidien,', 'Sa w bezwen,')}<br/>{t('plus simple.', 'pi fasil.')}<br/><em>{t('Plus proche.', 'Pi pre w.')}</em></h1>
        <p className="sf-hero-description">{t('Vos essentiels, vos envies et les petites trouvailles qui font plaisir. Une boutique pensée pour la vie d’ici.', 'Sa ki esansyèl, sa w renmen ak bèl ti dekouvèt. Yon boutik ki fèt pou lavi lakay nou.')}</p>
        <div className="sf-hero-actions"><button className="sf-primary" onClick={() => { setStockOnly(false); chooseFilter('all') }}>{t('Je découvre la boutique', 'Mwen dekouvri boutik la')}<ArrowUpRight size={19}/></button><span className="sf-hero-note">Tout sa w bezwen,<br/><b>pi pre w.</b></span></div>
        <div className="sf-hero-reassurance"><span><Check size={14}/>{t('Prix en gourdes', 'Pri an goud')}</span><span><Check size={14}/>{t('Sans compte obligatoire', 'Pa bezwen kont')}</span></div>
      </div>
      <div className="sf-hero-art">
        <img src="/images/hero.svg" alt={t('Une sélection de produits du quotidien DS STORE', 'Yon seleksyon pwodwi pou chak jou nan DS STORE')} width="700" height="650" fetchPriority="high"/>
        <div className="sf-hero-stamp"><span>{t('UNE BOUTIQUE', 'YON BOUTIK')}</span><strong>{t('du Sud.', 'nan Sid.')}<br/>{t('pour vous.', 'pou ou.')}</strong><span>{t('PENSÉE POUR VOUS', 'KI PANSE AK OU')}</span></div>
        <div className="sf-hero-local"><span className="sf-local-icon"><ShoppingBag size={21}/></span><div><b>{t('La bonne adresse du Sud', 'Bon adrès nan Sid la')}</b><span>{t('Votre quotidien commence ici.', 'Chak jou w kòmanse isit la.')}</span></div><ArrowUpRight size={18}/></div>
      </div>
    </section>

    <section className="sf-service-strip" aria-label={t('Nos services', 'Sèvis nou yo')}>
      <button onClick={onDelivery}><span className="sf-service-icon"><Truck size={22}/></span><span><b>{t('Livraison locale', 'Livrezon lokal')}</b><small>{activeZones.length ? t(`${activeZones.length} zone${activeZones.length > 1 ? 's' : ''} disponible${activeZones.length > 1 ? 's' : ''}`, `${activeZones.length} zòn disponib`) : t('Consulter les zones', 'Gade zòn yo')}</small></span><ArrowUpRight size={16}/></button>
      <div><span className="sf-service-icon"><ShieldCheck size={22}/></span><span><b>{t('Vos achats, à votre rythme', 'Achte jan sa bon pou ou')}</b><small>{t('Sans création de compte', 'San ou pa kreye kont')}</small></span></div>
      <button onClick={onTrack}><span className="sf-service-icon"><Package size={22}/></span><span><b>{t('Du panier à votre porte', 'Depi panye rive lakay ou')}</b><small>{t('Suivre ma commande', 'Swiv kòmann mwen')}</small></span><ArrowUpRight size={16}/></button>
      <div><span className="sf-service-icon"><Smartphone size={22}/></span><span><b>{t('Simple, même sur mobile', 'Fasil, menm sou telefòn')}</b><small>{t('Pensé pour votre quotidien', 'Fèt pou lavi w chak jou')}</small></span></div>
    </section>

    <section className="sf-shop-section" id="sf-products" aria-labelledby="sf-catalog-title">
      <div className="sf-section-top"><div><span className="sf-kicker">{t('BIENVENUE CHEZ VOUS', 'BYENVINI LAKAY OU')}</span><h2 id="sf-catalog-title">{search ? t('Vos résultats', 'Rezilta ou yo') : category !== 'all' ? (lang === 'fr' ? selectedCategory?.name_fr : selectedCategory?.name_ht) : filter === 'all' ? t('De tout, pour votre quotidien.', 'Tout bagay pou chak jou w.') : filterLabels[filter]}</h2></div><span className="sf-section-side">{t('Bien choisir. Bien vivre.', 'Chwazi byen. Viv byen.')}<span>DS STORE</span></span></div>
      <div className="sf-categories" role="group" aria-label={t('Catégories', 'Kategori')}>
        <button aria-pressed={category === 'all'} className={category === 'all' ? 'sf-category sf-category-active' : 'sf-category'} onClick={() => setCategory('all')}><SlidersHorizontal size={17}/>{t('Tout explorer', 'Gade tout')}</button>
        {catalog.categories.map(c => <button key={c.id} aria-pressed={category === c.id} className={category === c.id ? 'sf-category sf-category-active' : 'sf-category'} onClick={() => setCategory(c.id)}><CategoryIcon slug={c.slug}/>{lang === 'fr' ? c.name_fr : c.name_ht}</button>)}
      </div>
      <div className="sf-filter-row"><div className="sf-filter-tabs" role="group" aria-label={t('Sélections commerciales', 'Seleksyon boutik la')}>
        {(['all', 'new', 'promo', 'popular', 'budget', 'special'] as Filter[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={filter === value ? 'sf-filter sf-filter-active' : 'sf-filter'}>{value === 'promo' && <Zap size={13}/>} {value === 'all' ? t('Pour vous', 'Pou ou') : value === 'new' ? t('Nouveautés', 'Nouvo') : value === 'promo' ? t('Promotions', 'Pwomosyon') : value === 'popular' ? t('Populaires', 'Popilè') : filterLabels[value]}</button>)}
      </div><label className="sf-sort"><span className="sf-sr-only">{t('Trier les produits', 'Klase pwodwi yo')}</span><select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="featured">{t('Notre sélection', 'Seleksyon nou')}</option><option value="price-asc">{t('Prix croissant', 'Pri pi ba an premye')}</option><option value="price-desc">{t('Prix décroissant', 'Pri pi wo an premye')}</option><option value="name">{t('Nom : A à Z', 'Non: A rive Z')}</option></select><ChevronDown size={15}/></label></div>
      <div className="sf-search-row"><label className="sf-search"><Search size={17}/><span className="sf-sr-only">{t('Rechercher un produit', 'Chèche yon pwodwi')}</span><input type="search" placeholder={t('Une envie, un produit…', 'Yon bagay ou vle, yon pwodwi…')} value={search} onChange={e => onSearch(e.target.value)}/>{search && <button onClick={() => onSearch('')} aria-label={t('Effacer la recherche', 'Efase rechèch la')}><X size={16}/></button>}</label><span className="sf-result-count">{products.length} {t(products.length === 1 ? 'produit' : 'produits', 'pwodwi')}</span><label className="sf-stock-filter"><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)}/>{t('En stock uniquement', 'Sa ki nan stok sèlman')}</label></div>
      {filter === 'budget' && <p className="sf-filter-note"><Tag size={15}/>{t('Notre sélection à 1 500 G ou moins.', 'Seleksyon nou an pou 1 500 G oswa pi ba.')}</p>}
      {filter === 'special' && activePromotions.length > 0 && <><p className="sf-filter-note">{t('Saisissez votre code lors de la commande pour appliquer l’offre.', 'Antre kòd ou lè w ap kòmande pou aplike òf la.')}</p><div className="sf-promotions">{activePromotions.map(p => <span key={p.id}><Tag size={15}/>{lang === 'fr' ? p.title_fr : p.title_ht} <b>{p.code}</b> −{p.discount_percent}%</span>)}</div></>}
      {products.length ? <div className="sf-product-grid">{products.map((p, index) => {
        const discounted = priceOf(p) < p.price
        const productCategory = catalog.categories.find(c => c.id === p.category_id)
        return <article className="sf-product" key={p.id}>
          <div className={`sf-product-visual sf-tone-${index % 4}`}>
            <button onClick={() => onProduct(p)} className="sf-product-image-button" aria-label={t(`Voir ${p.name_fr}`, `Gade ${p.name_ht}`)}><img src={p.image_url || '/images/backpack.svg'} alt={lang === 'fr' ? p.name_fr : p.name_ht} width="400" height="400" loading="lazy" decoding="async" onError={e => { if (!e.currentTarget.src.endsWith('/images/backpack.svg')) e.currentTarget.src = '/images/backpack.svg' }}/></button>
            <div className="sf-product-badges">{discounted ? <span className="sf-badge sf-sale">−{Math.round((1 - priceOf(p) / p.price) * 100)}%</span> : p.is_new ? <span className="sf-badge sf-new">{t('Nouveau', 'Nouvo')}</span> : p.featured ? <span className="sf-badge sf-popular">{t('La sélection DS', 'Seleksyon DS')}</span> : null}{p.stock <= 0 && <span className="sf-badge sf-out">{t('Épuisé', 'Fini')}</span>}</div>
            <button className="sf-quick-view" onClick={() => onProduct(p)} aria-label={t(`Détails de ${p.name_fr}`, `Detay ${p.name_ht}`)}><ArrowUpRight size={17}/></button>
          </div>
          <div className="sf-product-body"><span className="sf-product-category">{lang === 'fr' ? productCategory?.name_fr : productCategory?.name_ht}</span><button className="sf-product-name" onClick={() => onProduct(p)}><h3>{lang === 'fr' ? p.name_fr : p.name_ht}</h3></button><div className="sf-product-bottom"><div className="sf-product-prices"><strong>{money(priceOf(p), lang)}</strong>{discounted && <del>{money(p.price, lang)}</del>}</div><button className="sf-add" onClick={() => onAdd(p)} disabled={p.stock <= 0} aria-label={t(`Ajouter ${p.name_fr} au panier`, `Mete ${p.name_ht} nan panye`)}><ShoppingBag size={16}/><span>{t('Ajouter', 'Ajoute')}</span></button></div></div>
        </article>
      })}</div> : <div className="sf-empty"><Search size={34}/><h3>{t('Aucun produit pour le moment', 'Pa gen pwodwi pou kounye a')}</h3><p>{t('Essayez une autre recherche ou explorez toutes les catégories.', 'Eseye yon lòt rechèch oswa gade tout kategori yo.')}</p><button className="sf-primary" onClick={() => { onSearch(''); setCategory('all'); setFilter('all'); setStockOnly(false) }}>{t('Voir tous les produits', 'Gade tout pwodwi yo')}<ArrowRight size={17}/></button></div>}
      {products.length > 0 && <p className="sf-catalog-end"><span/>{t('Vous avez vu toute notre sélection.', 'Ou fin wè tout seleksyon nou an.')}<span/></p>}
    </section>

    <section className="sf-highlights" aria-label={t('À découvrir', 'Pou dekouvri')}>
      <button className="sf-highlight sf-highlight-promo" onClick={() => chooseFilter('promo')}><span className="sf-highlight-top"><Tag size={20}/>{t('LES BONS PLANS DU MOMENT', 'BON PLAN MOMAN AN')}</span><h2>{t('Les petits prix font', 'Ti pri yo fè')}<br/><em>{t('les grands plaisirs.', 'gwo kè kontan.')}</em></h2><span className="sf-highlight-link">{t('Promotions de la semaine', 'Pwomosyon semèn nan')}<ArrowUpRight size={21}/></span><div className="sf-promo-decoration" aria-hidden="true">%</div></button>
      <button className="sf-highlight sf-highlight-local" onClick={onDelivery}><span className="sf-highlight-top"><MapPin size={20}/>{t('ANCRÉS DANS LE GRAND SUD', 'RASIN NOU NAN GRAN SID')}</span><h2>{t('D’ici. Pour vous.', 'Lakay. Pou ou.')}<br/><em>{t('Tout simplement.', 'Tou senpleman.')}</em></h2><span className="sf-highlight-link">{t('Découvrir la livraison locale', 'Dekouvri livrezon lokal')}<ArrowUpRight size={21}/></span><div className="sf-local-decoration" aria-hidden="true"><MapPin size={100} strokeWidth={1}/></div></button>
    </section>
    <section className="sf-last-note"><span className="sf-note-icon"><Sparkles size={23}/></span><div><h2>{t('Votre boutique. Votre quotidien.', 'Boutik pa w. Chak jou w.')}</h2><p>{t('Le choix, la simplicité et cette petite attention qui fait la différence.', 'Chwa, fasilite ak ti atansyon ki fè tout diferans lan.')}</p></div><span className="sf-slogan">Tout sa w bezwen,<br/><em>pi pre w.</em></span></section>
  </div>
}
