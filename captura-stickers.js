import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = resolve(__dirname, 'cookies.json');
const OUTPUT_FILE = resolve(__dirname, 'docs/stickers.json');
const ALBUM_URL = 'https://www.monopolygo.com/sticker-album';
const API_PATTERN = 'web-portal/sticker-trading';
const CDP_PORT = 9333;

function carregarAnterior() {
  try {
    return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

async function capturar() {
  let browser;
  let isCDP = false;
  let page;

  try {
    const test = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    isCDP = test.ok;
  } catch {}

  if (isCDP) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    console.log('✓ Conectado ao Brave');
  } else {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   Brave com CDP não encontrado.                 ║');
    console.log('║                                                ║');
    console.log('║   Rode: open -a "Brave Browser" --args          ║');
    console.log('║          --remote-debugging-port=9333           ║');
    console.log('║                                                ║');
    console.log('║   Depois: npm run capture                       ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    return;
  }

  try {
    const context = browser.contexts()[0];
    page = await context.newPage();

    page.setDefaultTimeout(120000);

    // 1. Captura em português
    console.log('→ Capturando stickers (pt-BR)...');
    const apiPromisePt = page.waitForResponse(r =>
      r.url().includes(API_PATTERN) && r.status() === 200
    );

    await page.goto(ALBUM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('  → URL:', page.url());

    if (!page.url().includes('sticker-album')) {
      console.log('');
      console.log('╔════════════════════════════════════════════════╗');
      console.log('║   Faça login na aba que abriu no Brave.       ║');
      console.log('╚════════════════════════════════════════════════╝');
      console.log('');
      await page.waitForURL('**/sticker-album', { timeout: 180000 });
      console.log('✓ Login detectado!');
    } else {
      console.log('✓ Já logado!');
    }

    const cookies = await context.cookies();
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

    let resp = await Promise.race([
      apiPromisePt,
      new Promise(res => setTimeout(res, 3000)).then(() => null),
    ]);

    if (!resp) {
      console.log('  → Recarregando para capturar API...');
      const p2 = page.waitForResponse(r =>
        r.url().includes(API_PATTERN) && r.status() === 200
      );
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      resp = await p2;
    }

    const ptData = await resp.json();
    if (!ptData.IsSuccess) {
      console.error('✗ Erro na API pt-BR:', ptData.Error);
      return;
    }
    console.log('✓ Dados pt-BR capturados');

    // 2. Tenta capturar em inglês (pode falhar por causa da assinatura da URL)
    console.log('→ Capturando stickers (en)...');
    let enLookup = {};
    try {
      const apiUrlEn = resp.url().replace('c_locale=pt-br', 'c_locale=en');
      const enResp = await page.request.fetch(apiUrlEn);
      if (enResp.ok) {
        const enData = await enResp.json();
        if (enData.IsSuccess) {
          for (const set of enData.Data.Sets) {
            for (const s of set.Stickers) {
              enLookup[s.StickerId] = s.StickerName;
            }
          }
          console.log('✓ Dados en capturados');
        }
      }
    } catch {
      console.log('  ↳ EN indisponível, mantendo traduções anteriores');
    }

    if (Object.keys(enLookup).length === 0) {
      console.log('  ↳ Usando traduções anteriores como fallback');
    }

    // 3. Merge: junta nomes em inglês ao dataset em português
    salvarDados(ptData, enLookup);
    console.log('✓ Dados salvos em docs/stickers.json!');
  } catch (err) {
    console.error('✗ Erro:', err.message);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

function salvarDados(ptData, enLookup) {
  const anterior = carregarAnterior();

  // Monta lookup de traduções antigas: nome PT → { nomeEn, nomeSetEn? }
  const traducoesAntigas = {};
  if (anterior) {
    for (const set of anterior.sets) {
      traducoesAntigas[set.nome] = { nomeEn: set.nomeEn };
      for (const s of set.stickers) {
        if (s.nomeEn) traducoesAntigas[s.nome] = s.nomeEn;
      }
    }
  }

  const sets = ptData.Data.Sets.map((set, i) => {
    const setAnterior = traducoesAntigas[set.SetName];
    return {
      numero: i + 1,
      nome: set.SetName,
      nomeEn: (setAnterior?.nomeEn) || set.SetName,
      stickers: set.Stickers.map(s => ({
        nome: s.StickerName,
        nomeEn: enLookup[s.StickerId] || traducoesAntigas[s.StickerName] || s.StickerName,
        tenho: s.OwnedCount,
        raridade: s.Rarity,
      })),
    };
  });

  const simplified = {
    album: ptData.Data.AlbumName,
    locale: ptData.Data.Locale,
    atualizadoEm: new Date().toISOString(),
    totalStickers: sets.reduce((acc, s) => acc + s.stickers.length, 0),
    sets,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(simplified, null, 2));
}

capturar();
