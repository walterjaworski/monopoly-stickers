import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = resolve(__dirname, 'cookies.json');
const OUTPUT_FILE = resolve(__dirname, 'site/stickers.json');
const ALBUM_URL = 'https://www.monopolygo.com/sticker-album';
const API_PATTERN = 'web-portal/sticker-trading';
const CDP_PORT = 9333;

async function capturar() {
  // Tenta conectar no Brave já aberto via CDP
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
    console.log('║   Para funcionar, RODE ESTE COMANDO:            ║');
    console.log('║                                                ║');
    console.log('║   open -a "Brave Browser" --args                ║');
    console.log('║        --remote-debugging-port=9333             ║');
    console.log('║                                                ║');
    console.log('║   Depois, execute npm run capture novamente.    ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    return;
  }

  try {
    const context = browser.contexts()[0];
    page = await context.newPage();

    page.setDefaultTimeout(120000);
    const apiPromise = page.waitForResponse(r =>
      r.url().includes(API_PATTERN) && r.status() === 200
    );

    console.log('→ Navegando para o álbum...');
    await page.goto(ALBUM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('  → URL:', page.url());

    if (!page.url().includes('sticker-album')) {
      console.log('');
      console.log('╔════════════════════════════════════════════════╗');
      console.log('║   Faça login na aba que abriu no Brave.       ║');
      console.log('║   Após logar, aguarde a captura automática.   ║');
      console.log('╚════════════════════════════════════════════════╝');
      console.log('');
      await page.waitForURL('**/sticker-album', { timeout: 180000 });
      console.log('✓ Login detectado!');
    } else {
      console.log('✓ Já logado!');
    }

    // Salva cookies pra fallback futuro
    const cookies = await context.cookies();
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('✓ Cookies salvos');

    // Espera a API (se já passou, recarrega)
    console.log('→ Aguardando API dos stickers...');
    let resp = await Promise.race([
      apiPromise,
      new Promise(res => setTimeout(res, 3000)).then(() => null),
    ]);

    if (!resp) {
      console.log('  → API não capturada no 1º load, recarregando...');
      const apiPromise2 = page.waitForResponse(r =>
        r.url().includes(API_PATTERN) && r.status() === 200
      );
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      resp = await apiPromise2;
    }

    const data = await resp.json();

    if (data.IsSuccess) {
      salvarDados(data);
      console.log('✓ Dados salvos em site/stickers.json!');
    } else {
      console.error('✗ Erro na API:', data.Error || 'desconhecido');
    }
  } catch (err) {
    console.error('✗ Erro:', err.message);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

function salvarDados(raw) {
  const simplified = {
    album: raw.Data.AlbumName,
    locale: raw.Data.Locale,
    atualizadoEm: new Date().toISOString(),
    totalStickers: raw.Data.Sets.reduce(
      (acc, set) => acc + set.Stickers.length, 0
    ),
    sets: raw.Data.Sets.map(set => ({
      nome: set.SetName,
      stickers: set.Stickers.map(s => ({
        nome: s.StickerName,
        tenho: s.OwnedCount,
        raridade: s.Rarity,
      })),
    })),
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(simplified, null, 2));
}

capturar();
