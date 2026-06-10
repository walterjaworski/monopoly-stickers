const RARIDADE_GOLD = [6, 7, 8, 9, 10, 11];

function estrelas(raridade) {
  if (raridade >= 9) return '⭐'.repeat(5);
  return '⭐'.repeat(raridade);
}

function isGold(raridade) {
  return RARIDADE_GOLD.includes(raridade);
}

function render(stickers, filtros) {
  const album = document.getElementById('album');
  const selectSet = document.getElementById('filtro-set');
  const busca = (filtros?.busca || '').toLowerCase();
  const setFiltro = filtros?.set || '';
  const statusFiltro = filtros?.status || '';

  const setsFiltrados = stickers.sets.filter(s => !setFiltro || s.nome === setFiltro);

  album.innerHTML = '';
  let totalStickers = 0;
  let totalTenho = 0;
  let totalFalta = 0;
  let totalDup = 0;

  for (const set of setsFiltrados) {
    let stickersSet = set.stickers;

    if (busca) {
      stickersSet = stickersSet.filter(s => s.nome.toLowerCase().includes(busca));
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
        <span>${set.nome}</span>
        <span class="set-progresso">${progressoSet}</span>
      </div>
      <div class="stickers-grid">
        ${stickersSet.map(s => {
          const cls = s.tenho === 0 ? 'falta' : s.tenho > 1 ? 'duplicata' : 'tem';
          const gold = isGold(s.raridade);
          return `
            <div class="sticker ${cls} ${gold ? 'gold' : ''}">
              ${s.tenho > 1 ? `<span class="badge-dup">${s.tenho}</span>` : ''}
              <div class="sticker-indicator">${s.tenho > 0 ? '✔' : '—'}</div>
              <div class="sticker-nome">${s.nome}</div>
              <div class="estrelas">${estrelas(s.raridade)}</div>
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

    document.getElementById('subtitle').textContent =
      `${data.album} · ${data.locale.toUpperCase()}`;
    document.getElementById('atualizado-em').textContent =
      new Date(data.atualizadoEm).toLocaleString('pt-BR');

    // Popular select de sets
    const select = document.getElementById('filtro-set');
    data.sets.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.nome;
      opt.textContent = s.nome;
      select.appendChild(opt);
    });

    function getFiltros() {
      return {
        busca: document.getElementById('busca').value,
        set: document.getElementById('filtro-set').value,
        status: document.getElementById('filtro-status').value,
      };
    }

    function onChange() {
      render(data, getFiltros());
    }

    document.getElementById('busca').addEventListener('input', onChange);
    document.getElementById('filtro-set').addEventListener('change', onChange);
    document.getElementById('filtro-status').addEventListener('change', onChange);

    render(data, getFiltros());
  } catch (err) {
    document.getElementById('album').innerHTML =
      '<p style="text-align:center;color:#e55;padding:2rem;">Erro ao carregar stickers. Execute o script de captura primeiro.</p>';
    console.error(err);
  }
}

main();
