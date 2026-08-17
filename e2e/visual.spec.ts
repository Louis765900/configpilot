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
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/#home')
    await expect(page).toHaveTitle('ConfigPilot — Comparateur et configurateur PC')
    await expect(page.getByRole('heading', { name: /Le copilote de votre/ })).toBeVisible()
    const overflowing = await page.locator('body *').evaluateAll(elements => elements.filter(element => {
      const box = element.getBoundingClientRect()
      return box.right > document.documentElement.clientWidth + 1 || box.left < -1
    }).map(element => `${element.tagName.toLowerCase()}.${element.className}`))
    expect(overflowing).toEqual([])
    if (viewport.name === 'desktop-large') await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true })
    if (viewport.name === 'mobile') await page.screenshot({ path: 'docs/screenshots/home-mobile.png', fullPage: true })
    expect(errors).toEqual([])
  })
}

test('parcours catalogue, configurateur et persistance locale', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/#catalog')
  await page.getByPlaceholder('Nom, référence, marque, socket…').fill('i9-9900KF')
  await expect(page.getByRole('heading', { name: 'Intel Core i9-9900KF' })).toBeVisible()
  await page.goto('/#builder')
  await expect(page.getByText('BIOS et génération')).toBeVisible()
  await page.reload()
  await expect(page.locator('.part-picker strong').filter({ hasText: 'Intel Core i9-9900KF' })).toBeVisible()
  expect(errors).toEqual([])
})

test('navigation mobile et thème sombre', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#home')
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.getByLabel('Navigation principale').getByRole('button', { name: 'Catalogue', exact: true }).click()
  await expect(page).toHaveURL(/#catalog/)
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('catalogue paginé et bot de découverte fonctionnel', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://www.wikidata.org/w/api.php?**', route => route.fulfill({
    contentType:'application/json',
    body:JSON.stringify({search:[{id:'QTEST',label:'ASUS ROG Test Board',description:'carte mère de test',concepturi:'https://www.wikidata.org/wiki/QTEST'}]}),
  }))
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/#catalog')
  await expect(page.getByRole('navigation', { name: 'Pagination du catalogue' })).toBeVisible()
  await expect(page.locator('.product-row')).toHaveCount(40)
  await page.goto('/#bots')
  await expect(page.getByRole('heading', { name: 'Élargir le catalogue, sans inventer.' })).toBeVisible()
  await expect(page.getByText(/20 ont des métadonnées constructeur collectées, 16 sont validés humainement et 16 sont intégrés/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Couverture du bot' })).toContainText('55 marques · 89 recherches')
  await expect(page.getByRole('region', { name: 'Couverture du bot' })).toContainText('5 index constructeurs · 9/9 catégories')
  await expect(page.getByRole('region', { name: 'Couverture du bot' }).locator('article')).toHaveCount(9)
  const specPanel = page.getByRole('region', { name: 'Caractéristiques normalisées' })
  await expect(specPanel).toContainText(/\d+ fiches · \d+ valeurs/)
  await expect(specPanel).toContainText('Une caractéristique absente de la fiche reste inconnue')
  const specDetails = page.locator('.spec-details').first()
  await specDetails.locator('summary').click()
  await expect(specDetails.getByText('preuve automatique à relire')).toBeVisible()
  await expect(specDetails.locator('thead th')).toContainText(['Caractéristique', 'Valeur ConfigPilot', 'Valeur brute relevée', 'Confiance'])
  await expect(specDetails.getByText('Promotion bloquée.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Balayer 9 marques/ })).toBeVisible()
  await expect(page.locator('.candidate-list article').first()).toBeVisible()
  await page.getByRole('tab', { name: /Identifiants PCI/ }).click()
  await expect(page.locator('.candidate-list article').first().getByText('Identifiant PCI')).toBeVisible()
  await page.getByRole('tab', { name: /Faux positifs/ }).click()
  await expect(page.getByRole('heading', { name: 'GeForce Now', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Produits/ }).click()
  await page.getByRole('button', { name: 'Rechercher cette marque' }).click()
  await expect(page.getByRole('heading', { name: 'ASUS ROG Test Board' })).toBeVisible()
  expect(errors).toEqual([])
})
