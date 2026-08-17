import { useEffect, useState } from 'react'
import { ArrowRight, Calculator, CircuitBoard, Layers, ShieldCheck, TrendingDown } from 'lucide-react'
import { categoryLabels, products, starterBuilds } from '../data'
import { buildSummary, categoryOrder, getProduct, money } from '../engine'
import { buildVerdict, checkCompatibility } from '../compatibility'
import { StatusIcon } from '../ui'
import { PartArt } from '../illustrations'
import type { Build, Category } from '../types'
import type { Route } from '../routes'
import { getRemoteCatalogSize, remoteCatalogEnabled } from '../component-api'

export default function Home({ go, loadBuild }: { go: (route: Route) => void; loadBuild: (build: Build) => void }) {
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null)
  const demo = starterBuilds[0].build as Build
  const allChecks = checkCompatibility(demo)
  const checks = allChecks.filter(check => check.status !== 'info').slice(0, 3)
  const verdict = buildVerdict(allChecks)
  const summary = buildSummary(demo)
  const counts = Object.fromEntries(categoryOrder.map(category => [category, products.filter(item => item.category === category).length])) as Record<Category, number>

  useEffect(() => {
    if (!remoteCatalogEnabled) return
    const controller = new AbortController()
    getRemoteCatalogSize(controller.signal).then(setRemoteTotal).catch(() => undefined)
    return () => controller.abort()
  }, [])

  return (
    <div className="view">
      <section className="hero">
        <div>
          <span className="badge ok">Vérification de compatibilité</span>
          <h1>
            <span className="dim">Choisissez vos composants.</span>
            <span className="lit">On vérifie le reste.</span>
          </h1>
          <p>
            ConfigPilot assemble votre configuration dans le navigateur, croise chaque caractéristique publiée
            et signale les conflits avant l’achat. Quand une donnée manque, il le dit au lieu de deviner.
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => go({ page: 'builder' })}>
              <CircuitBoard /> Ouvrir le configurateur
            </button>
            <button className="btn secondary" onClick={() => go({ page: 'catalog' })}>
              Explorer le catalogue <ArrowRight />
            </button>
          </div>
        </div>

        <div className="hero-figure">
          <div className={`verdict-banner ${verdict.counts.error ? 'err' : 'ok'}`}>
            <span className="icon"><StatusIcon status={verdict.counts.error ? 'error' : 'ok'} /></span>
            <div>
              <h2>{verdict.counts.ok} contrôles validés</h2>
              <p>
                Exemple calculé en direct sur « {starterBuilds[0].name} »
                {verdict.counts.unknown > 0 && `, dont ${verdict.counts.unknown} sans donnée publiée`}.
              </p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>Diagnostic</h3>
              <span className="hint">{summary.estimated} W estimés · {summary.recommended} W conseillés</span>
            </div>
            <div className="panel-body stack tight">
              {checks.map(check => (
                <div className={`diag-item ${check.status}`} key={check.id}>
                  <StatusIcon status={check.status} />
                  <div>
                    <b>{check.label}</b>
                    <p>{check.detail}</p>
                  </div>
                </div>
              ))}
              <button className="btn ghost" onClick={() => { loadBuild(demo); go({ page: 'builder' }) }}>
                Charger cette configuration <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="feature-cards">
        <article role="button" tabIndex={0} onClick={() => go({ page: 'builder' })}
          onKeyDown={event => event.key === 'Enter' && go({ page: 'builder' })}>
          <CircuitBoard />
          <h3>Configurateur</h3>
          <p>Socket, chipset, BIOS, mémoire, dimensions, connecteurs, refroidissement : une vingtaine de contrôles croisés, chacun accompagné des champs sur lesquels il se prononce.</p>
        </article>
        <article role="button" tabIndex={0} onClick={() => go({ page: 'catalog' })}
          onKeyDown={event => event.key === 'Enter' && go({ page: 'catalog' })}>
          <TrendingDown />
          <h3>Fiches et trajectoire de prix</h3>
          <p>Tarif de lancement, décote depuis la sortie, rapport performance/prix face à la catégorie, et un verdict argumenté sur l’intérêt d’acheter aujourd’hui.</p>
        </article>
        <article role="button" tabIndex={0} onClick={() => go({ page: 'estimate' })}
          onKeyDown={event => event.key === 'Enter' && go({ page: 'estimate' })}>
          <Calculator />
          <h3>Estimation d’occasion</h3>
          <p>État, âge, preuves fournies par le vendeur, frais obligatoires et risque propre à la catégorie, pour situer une annonce sans relevé marchand.</p>
        </article>
      </div>

      <div className="section-head">
        <h2>Points de départ</h2>
        <span className="hint">Configurations publiques, modifiables ensuite</span>
      </div>
      <div className="grid cols-3">
        {starterBuilds.map(starter => {
          const starterSummary = buildSummary(starter.build as Build)
          const starterVerdict = buildVerdict(checkCompatibility(starter.build as Build))
          return (
            <section className="panel" key={starter.id}>
              <div className="panel-head">
                <h3>{starter.name}</h3>
                <span className={`badge ${starterVerdict.status === 'ok' ? 'ok' : starterVerdict.status === 'error' ? 'err' : starterVerdict.status === 'warning' ? 'warn' : ''}`}>
                  {starterVerdict.counts.error > 0 ? `${starterVerdict.counts.error} conflit` : starterVerdict.counts.warning > 0 ? `${starterVerdict.counts.warning} à confirmer` : 'Contrôles validés'}
                </span>
              </div>
              <div className="panel-body stack tight">
                <p className="muted" style={{ fontSize: 13 }}>{starter.summary}</p>
                <dl className="stack tight" style={{ margin: 0 }}>
                  {(['cpu', 'gpu', 'motherboard'] as Category[]).map(category => (
                    <div className="metric" key={category}>
                      <dt>{categoryLabels[category]}</dt>
                      <dd>{getProduct(starter.build[category])?.name ?? 'À choisir'}</dd>
                    </div>
                  ))}
                  <div className="metric">
                    <dt>Total indicatif</dt>
                    <dd className="big">{money(starterSummary.total)}</dd>
                  </div>
                </dl>
                <button className="btn secondary block" onClick={() => { loadBuild(starter.build as Build); go({ page: 'builder' }) }}>
                  Partir de cette base
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <div className="section-head">
        <h2>Couverture du catalogue</h2>
        <span className="hint">
          {remoteTotal == null
            ? `${products.length.toLocaleString('fr-FR')} références dans le socle local`
            : `${remoteTotal.toLocaleString('fr-FR')} références en base PostgreSQL · ${products.length.toLocaleString('fr-FR')} dans le socle local`}
        </span>
      </div>
      <div className="grid cols-3">
        {categoryOrder.map(category => (
          <button className="part-card" key={category} onClick={() => go({ page: 'catalog', category })}>
            <div className="part-card-top">
              <div className="art-frame sm"><PartArt category={category} /></div>
              <div className="part-card-id">
                <h3>{categoryLabels[category]}</h3>
                <span className="ref">{counts[category].toLocaleString('fr-FR')} références du socle local</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="notice" style={{ marginTop: 32 }}>
        <ShieldCheck />
        <p>
          <b>Ce que ConfigPilot ne fait pas.</b>
          Aucun prix marchand n’est relevé en direct : les montants affichés sont des repères calculés localement,
          jamais des offres. Aucune caractéristique n’est devinée : une donnée absente reste « à vérifier ».
        </p>
      </div>
      <div className="notice" style={{ marginTop: 10 }}>
        <Layers />
        <p>
          <b>Un catalogue qui s’étend seul.</b>
          Des robots parcourent des sources ouvertes et des fiches constructeur officielles, mais rien n’est publié
          sans relecture humaine. L’écran Bots &amp; sources montre la file d’attente telle quelle.
        </p>
      </div>
    </div>
  )
}
