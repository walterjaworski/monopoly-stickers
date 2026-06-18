const RARIDADE_GOLD = [6, 7, 8, 9, 10, 11];

function estrelas(raridade) {
  if (raridade >= 9) return '⭐'.repeat(5);
  return '⭐'.repeat(raridade);
}

function isGold(raridade) {
  return RARIDADE_GOLD.includes(raridade);
}

const i18n = {
  pt: {
    'title': 'Meus Stickers - Monopoly GO',
    'heading': '🎲 Meus Stickers',
    'stat-tenho': 'tenho',
    'stat-falta': 'faltando',
    'stat-dup': 'duplicatas',
    'busca-placeholder': 'Buscar sticker...',
    'filtro-set-all': 'Todos os sets',
    'filtro-estrelas-all': 'Todas as estrelas',
    'filtro-gold': 'Dourada',
    'filtro-status-all': 'Todos os status',
    'filtro-status-tenho': 'Tenho',
    'filtro-status-falta': 'Faltando',
    'filtro-status-dup': 'Duplicatas',
    'footer': 'Atualizado em:',
    'error-load': 'Erro ao carregar stickers. Execute o script de captura primeiro.',
  },
  en: {
    'title': 'My Stickers - Monopoly GO',
    'heading': '🎲 My Stickers',
    'stat-tenho': 'have',
    'stat-falta': 'missing',
    'stat-dup': 'duplicates',
    'busca-placeholder': 'Search sticker...',
    'filtro-set-all': 'All sets',
    'filtro-estrelas-all': 'All stars',
    'filtro-gold': 'Gold',
    'filtro-status-all': 'All status',
    'filtro-status-tenho': 'Have',
    'filtro-status-falta': 'Missing',
    'filtro-status-dup': 'Duplicates',
    'footer': 'Updated:',
    'error-load': 'Error loading stickers. Run the capture script first.',
  },
};

let lingua = localStorage.getItem('lingua') || 'pt';
let dadosStickers = null;

function tr(key) {
  return i18n[lingua][key] || i18n['pt'][key] || key;
}

function aplicarTraducao() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = tr(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = tr(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = lingua === 'pt' ? 'pt-BR' : 'en';

  if (dadosStickers) {
    const select = document.getElementById('filtro-set');
    const currentVal = select.value;
    select.innerHTML = `<option value="">${tr('filtro-set-all')}</option>`;
    dadosStickers.sets.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.nome;
      opt.textContent = nomeSetDisplay(s);
      select.appendChild(opt);
    });
    select.value = currentVal;

    const estrelasSet = new Set();
    dadosStickers.sets.forEach(s => s.stickers.forEach(st => estrelasSet.add(starCount(st.raridade))));
    const maxStars = Math.max(...estrelasSet);
    const selEstrelas = document.getElementById('filtro-estrelas');
    const currentEstrelas = selEstrelas.value;
    selEstrelas.innerHTML = `<option value="">${tr('filtro-estrelas-all')}</option>`;
    for (let i = 1; i <= maxStars; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = '⭐'.repeat(i);
      selEstrelas.appendChild(opt);
    }
    selEstrelas.value = currentEstrelas;
  }
}

function toggleLingua(l) {
  lingua = l;
  localStorage.setItem('lingua', l);
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === l);
  });
  aplicarTraducao();
  if (typeof window.onChange === 'function') window.onChange();
}

function nomeDisplay(s) {
  return lingua === 'en' ? (s.nomeEn || s.nome) : s.nome;
}

function nomeSetDisplay(set) {
  const nome = lingua === 'en' ? (set.nomeEn || set.nome) : set.nome;
  return set.numero ? `Set ${set.numero} - ${nome}` : nome;
}

function starCount(raridade) {
  if (raridade >= 9) return 5;
  return raridade;
}

function render(stickers, filtros) {
  const album = document.getElementById('album');
  const busca = (filtros?.busca || '').toLowerCase();
  const setFiltro = filtros?.set || '';
  const statusFiltro = filtros?.status || '';
  const estrelasFiltro = filtros?.estrelas || '';
  const goldFiltro = filtros?.gold || '';

  const setsFiltrados = stickers.sets.filter(s => !setFiltro || s.nome === setFiltro);

  album.innerHTML = '';
  let totalStickers = 0;
  let totalTenho = 0;
  let totalFalta = 0;
  let totalDup = 0;

  for (const set of setsFiltrados) {
    let stickersSet = set.stickers;

    if (busca) {
      stickersSet = stickersSet.filter(s =>
        nomeDisplay(s).toLowerCase().includes(busca) ||
        s.nomeEn?.toLowerCase().includes(busca)
      );
    }

    if (estrelasFiltro === '5+') {
      stickersSet = stickersSet.filter(s => s.raridade >= 9);
    } else if (estrelasFiltro) {
      stickersSet = stickersSet.filter(s => starCount(s.raridade) === Number(estrelasFiltro));
    }

    if (goldFiltro) {
      stickersSet = stickersSet.filter(s => isGold(s.raridade));
    }

    if (statusFiltro === 'tenho') {
      stickersSet = stickersSet.filter(s => s.tenho >= 1);
    } else if (statusFiltro === 'falta') {
      stickersSet = stickersSet.filter(s => s.tenho === 0);
    } else if (statusFiltro === 'duplicata') {
      stickersSet = stickersSet.filter(s => s.tenho > 1);
    }

    if (stickersSet.length === 0) continue;

    const tenhoSet = stickersSet.filter(s => s.tenho >= 1).length;
    const progressoSet = `(${tenhoSet}/${stickersSet.length})`;

    totalStickers += stickersSet.length;
    stickersSet.forEach(s => {
      if (s.tenho >= 1) totalTenho++;
      if (s.tenho === 0) totalFalta++;
      if (s.tenho > 1) totalDup++;
    });

    const div = document.createElement('div');
    div.className = 'set';

    div.innerHTML = `
      <div class="set-header">
        <span>${nomeSetDisplay(set)}</span>
        <span class="set-progresso">${progressoSet}</span>
      </div>
      <div class="stickers-grid">
        ${stickersSet.map(s => {
          const cls = s.tenho === 0 ? 'falta' : s.tenho > 1 ? 'duplicata' : 'tem';
          const gold = isGold(s.raridade);
          return `
            <div class="sticker ${cls} ${gold ? 'gold' : ''}">
              ${s.tenho > 1 ? `<span class="badge-dup">+${s.tenho - 1}</span>` : ''}
              <div class="estrelas">${estrelas(s.raridade)}</div>
              <div class="sticker-nome">${nomeDisplay(s)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    album.appendChild(div);
  }

  document.getElementById('stat-tenho').textContent = totalTenho;
  document.getElementById('stat-falta').textContent = totalFalta;
  document.getElementById('stat-dup').textContent = totalDup;

  const pct = totalStickers > 0 ? (totalTenho / totalStickers * 100) : 0;
  document.getElementById('barra-progresso').style.width = pct.toFixed(1) + '%';
}

async function main() {
  try {
    const resp = await fetch('stickers.json');
    const data = await resp.json();

    dadosStickers = data;

    document.getElementById('subtitle').textContent =
      `Monopoly GO · ${data.locale.toUpperCase()}`;
    document.getElementById('atualizado-em').textContent =
      new Date(data.atualizadoEm).toLocaleString('pt-BR');

    function getFiltros() {
      return {
        busca: document.getElementById('busca').value,
        set: document.getElementById('filtro-set').value,
        estrelas: document.getElementById('filtro-estrelas').value,
        gold: document.getElementById('filtro-gold').checked,
        status: document.getElementById('filtro-status').value,
      };
    }

    function toggleClearBtn() {
      const btn = document.getElementById('btn-limpar-busca');
      const input = document.getElementById('busca');
      btn.classList.toggle('visible', input.value.length > 0);
    }

    window.onChange = function() {
      render(dadosStickers, getFiltros());
      toggleClearBtn();
    };
    document.getElementById('busca').addEventListener('input', onChange);
    document.getElementById('filtro-set').addEventListener('change', onChange);
    document.getElementById('filtro-estrelas').addEventListener('change', onChange);
    document.getElementById('filtro-gold').addEventListener('change', onChange);
    document.getElementById('filtro-status').addEventListener('change', onChange);

    document.getElementById('btn-limpar-busca').addEventListener('click', () => {
      document.getElementById('busca').value = '';
      onChange();
      document.getElementById('busca').focus();
    });

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleLingua(btn.dataset.lang));
    });

    toggleLingua(lingua);
  } catch (err) {
    document.getElementById('album').innerHTML =
      `<p style="text-align:center;color:#e55;padding:2rem;">${tr('error-load')}</p>`;
    console.error(err);
  }
}

main();
