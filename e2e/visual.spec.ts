import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'desktop-large', width: 1920, height: 1080 },
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-small', width: 360, height: 800 },
]

for (const viewport of viewports) {
  test(`accueil sans débordement — ${viewport.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/#home')
    await expect(page).toHaveTitle('ConfigPilot — Comparateur et configurateur PC')
    await expect(page.getByRole('heading', { name: /On vérifie le reste/ })).toBeVisible()
    // Le tiroir de navigation est volontairement hors écran quand il est fermé : on l'exclut,
    // et on vérifie séparément qu'aucune barre de défilement horizontale n'apparaît.
    const overflowing = await page.locator('body *').evaluateAll(elements => elements.filter(element => {
      if (element.closest('.sidebar:not(.open)')) return false
      return element.getBoundingClientRect().right > document.documentElement.clientWidth + 1
    }).map(element => `${element.tagName.toLowerCase()}.${element.className}`))
    expect(overflowing).toEqual([])
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(scroll).toBeLessThanOrEqual(1)
    if (viewport.name === 'desktop-large') await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true })
    if (viewport.name === 'mobile') await page.screenshot({ path: 'docs/screenshots/home-mobile.png', fullPage: true })
    expect(errors).toEqual([])
  })
}

test('aucun débordement horizontal sur les écrans denses en mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const hash of ['#catalog', '#builder', '#product/gpu-4070s', '#compare', '#estimate', '#advisor', '#bots', '#glossary']) {
    await page.goto(`/${hash}`)
    const overflowing = await page.locator('main, .view *').evaluateAll(elements => elements.filter(element => {
      if (element.closest('.sidebar:not(.open)') || element.closest('.table-scroll') || element.closest('.spec-scroll')) return false
      return element.getBoundingClientRect().right > document.documentElement.clientWidth + 1
    }).map(element => `${element.tagName.toLowerCase()}.${element.className}`))
    expect(overflowing, `débordement sur ${hash}`).toEqual([])
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(scroll, `défilement horizontal sur ${hash}`).toBeLessThanOrEqual(1)
  }
})

test('le site ne fait aucune référence à une machine personnelle', async ({ page }) => {
  for (const hash of ['#home', '#builder', '#catalog', '#advisor']) {
    await page.goto(`/${hash}`)
    await expect(page.locator('body')).not.toContainText('Louis')
  }
})

test('configurateur : détection d’un conflit et diagnostic justifié', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/#builder')

  await page.getByLabel('Choisir Processeurs').selectOption({ label: 'AMD Ryzen 5 7600' })
  await page.getByLabel('Choisir Cartes mères').selectOption({ label: 'MSI Z390-A PRO' })
  await expect(page.getByText('conflit', { exact: false }).first()).toBeVisible()
  const socketCheck = page.locator('.diag-item').filter({ hasText: 'Socket processeur' })
  await expect(socketCheck).toContainText('AM5')
  await expect(socketCheck).toContainText('Champs lus : Processeur.Socket · Carte mère.Socket')

  await page.getByLabel('Choisir Cartes mères').selectOption({ label: 'Gigabyte B650 EAGLE AX' })
  await expect(socketCheck).toContainText('identique des deux côtés')
  expect(errors).toEqual([])
})

test('configurateur : une donnée absente ne devient jamais un verdict favorable', async ({ page }) => {
  await page.goto('/#builder')
  await page.getByLabel('Choisir Refroidissement').selectOption({ label: 'Arctic Liquid Freezer III 240' })
  await page.getByLabel('Choisir Boîtiers').selectOption({ label: 'Fractal Design Pop Air' })
  const height = page.locator('.diag-item').filter({ hasText: 'Hauteur du ventirad' })
  await expect(height).toContainText('non renseignés')
  await expect(height).toHaveClass(/unknown/)
})

test('fiche composant : caractéristiques, trajectoire de prix et verdict', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#product/cpu-5600')

  await expect(page.getByRole('heading', { name: 'AMD Ryzen 5 5600' })).toBeVisible()
  await expect(page.getByText('Tarif conseillé en 2022')).toBeVisible()
  await expect(page.getByRole('img', { name: /Trajectoire de prix/ })).toBeVisible()
  await expect(page.getByText('Trajectoire modélisée, pas relevée.')).toBeVisible()
  await expect(page.getByText('Vaut-il le coup aujourd’hui ?')).toBeVisible()
  await expect(page.locator('.spec-block').filter({ hasText: 'Plateforme' })).toContainText('AM4')
  await expect(page.getByRole('img', { name: /processeur/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('catalogue : filtres, illustrations et accès aux fiches', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#catalog')
  await expect(page.locator('.part-card').first()).toBeVisible()
  await expect(page.locator('.part-card .part-art').first()).toBeVisible()
  await page.getByRole('radio', { name: /Mémoire RAM/ }).check()
  await expect(page.locator('.part-card').first()).toContainText('DDR')
  await page.locator('.part-card').first().getByRole('button', { name: 'Fiche' }).click()
  await expect(page).toHaveURL(/#product\//)
})

test('navigation mobile et thème clair', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#home')
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Catalogue' }).click()
  await expect(page).toHaveURL(/#catalog/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Activer le thème clair' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('bots : quarantaine, caractéristiques normalisées et découverte', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://www.wikidata.org/w/api.php?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ search: [{ id: 'QTEST', label: 'ASUS ROG Test Board', description: 'carte mère de test' }] }),
  }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#bots')

  await expect(page.getByRole('heading', { name: 'Élargir le catalogue, sans rien inventer.' })).toBeVisible()
  await expect(page.getByText(/20 fiches ont des caractéristiques normalisées à relire/)).toBeVisible()
  const specDetails = page.locator('.spec-details').first()
  await specDetails.locator('summary').click()
  await expect(specDetails.locator('thead th')).toContainText(['Caractéristique', 'Valeur ConfigPilot', 'Valeur brute relevée', 'Confiance'])
  await expect(specDetails).toContainText('Promotion bloquée.')

  await page.getByRole('tab', { name: /Faux positifs/ }).click()
  await expect(page.getByRole('heading', { name: 'GeForce Now', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Produits/ }).click()
  await page.getByRole('button', { name: 'Rechercher cette marque' }).click()
  await expect(page.getByRole('heading', { name: 'ASUS ROG Test Board' })).toBeVisible()
  expect(errors).toEqual([])
})
