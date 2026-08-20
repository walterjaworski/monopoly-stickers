import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = resolve(__dirname, 'cookies.json');
const OUTPUT_FILE = resolve(__dirname, 'docs/stickers.json');
const ALBUM_URL = 'https://www.monopolygo.com/sticker-album';
const API_PATTERN = 'web-portal/sticker-trading';
const CDP_PORT = 9333;
const WIKI_API = 'https://api.monopolygo.wiki/v1/mogo-wiki/app-service/tool-config';
const WIKI_CACHE_FILE = resolve(__dirname, 'wiki-cache.json');
const WIKI_CACHE_TTL = 15 * 24 * 60 * 60 * 1000;

function carregarAnterior() {
  try {
    return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function carregarCacheWiki() {
  try {
    const cache = JSON.parse(readFileSync(WIKI_CACHE_FILE, 'utf-8'));
    const idade = Date.now() - new Date(cache.atualizadoEm).getTime();
    if (idade < WIKI_CACHE_TTL) {
      return { dados: cache, valido: true };
    }
    return { dados: cache, valido: false };
  } catch {
    return { dados: null, valido: false };
  }
}

function salvarCacheWiki(stickers, sets) {
  const cache = {
    atualizadoEm: new Date().toISOString(),
    stickers,
    sets,
  };
  writeFileSync(WIKI_CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function buscarNomesEN() {
  const { dados: cache, valido } = carregarCacheWiki();

  if (valido) {
    console.log('  → Usando cache wiki (15 dias de validade)');
    return montarLookupWiki(cache);
  }

  console.log('→ Buscando nomes EN do wiki...');
  try {
    const resp = await fetch(WIKI_API);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const config = data.config;

    if (config?.stickers && config?.sets) {
      salvarCacheWiki(config.stickers, config.sets);
      console.log('✓ Nomes EN capturados do wiki e cache salvos');
      return montarLookupWiki(config);
    }
    throw new Error('Dados incompletos na API wiki');
  } catch (err) {
    console.log(`  ↳ Wiki indisponível (${err.message}), usando cache como fallback`);
    if (cache) return montarLookupWiki(cache);
    console.log('  ↳ Sem cache disponível, traduções EN não serão preenchidas');
    return { sets: {}, stickers: {} };
  }
}

function montarLookupWiki(config) {
  const setsLookup = {};
  const stickersLookup = {};

  for (const [key, set] of Object.entries(config.sets)) {
    const match = key.match(/\.(\d+)$/);
    if (match) {
      setsLookup[parseInt(match[1])] = set.name;
    }
  }

  for (const [key, sticker] of Object.entries(config.stickers)) {
    const match = key.match(/_(\d+)_(\d+)$/);
    if (match) {
      const setNum = parseInt(match[1]);
      const stickerNum = parseInt(match[2]);
      const idx = `${setNum}:${stickerNum}`;
      stickersLookup[idx] = sticker.name;
    }
  }

  return { sets: setsLookup, stickers: stickersLookup };
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

    // 2. Busca nomes em inglês via wiki (com cache)
    const enLookup = await buscarNomesEN();

    // 3. Merge: junta nomes em inglês ao dataset em português
    salvarDados(ptData, enLookup);
    console.log('✓ Dados salvos em docs/stickers.json!');

    console.log('');
    console.log('→ Executando git add, commit e push...');
    execSync('git add -A', { stdio: 'inherit' });
    execSync('git commit -m "Atualização stickers $(date +%d/%m/%Y)"', { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log('✓ Git: commit e push realizados!');
  } catch (err) {
    console.error('✗ Erro:', err.message);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

function salvarDados(ptData, enLookup) {
  const anterior = carregarAnterior();

  // Monta lookup de traduções antigas como fallback
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
    const setNum = i + 1;
    const setAnterior = traducoesAntigas[set.SetName];
    return {
      numero: setNum,
      nome: set.SetName,
      nomeEn: enLookup.sets[setNum] || setAnterior?.nomeEn || set.SetName,
      stickers: set.Stickers.map((s, j) => {
        const stickerNum = j + 1;
        const key = `${setNum}:${stickerNum}`;
        return {
          nome: s.StickerName,
          nomeEn: enLookup.stickers[key] || traducoesAntigas[s.StickerName] || s.StickerName,
          tenho: s.OwnedCount,
          raridade: s.Rarity,
        };
      }),
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
