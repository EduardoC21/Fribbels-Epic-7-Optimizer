/*
 * Catalog.js — o style guide RODANDO. Serve para validar cada componente
 * isolado (e a paleta) sem depender de dados do backend.
 * É a Fase 0: se algo aqui está errado, está errado em todas as telas.
 */
'use strict';
const { html, useState } = require('./h.js');
const C = require('./components/index.js');
const theme = require('./theme.js');

const SETS = ['SpeedSet', 'CriticalSet', 'DestructionSet', 'TorrentSet', 'HealthSet'];
const SET_OPTS = SETS.map((s) => ({
  value: s, label: s.replace(/Set$/, ''), icon: html`<${C.SetIcon} set=${s} />`,
}));

function Section({ title, children }) {
  return html`<${C.Box} pad=${true} style=${{ marginBottom: 12 }}>
    <${C.SectionLabel} style=${{ marginBottom: 12 }}>${title}<//>
    ${children}
  <//>`;
}

function Swatch({ token, name, fn }) {
  return html`<div style=${{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)',
    border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px' }}>
    <span style=${{ width: 34, height: 34, borderRadius: 7, flex: 'none', background: `var(${token})`,
      border: '1px solid var(--line)' }}></span>
    <span>
      <span style=${{ fontSize: 11.5, fontWeight: 600 }}>${name}</span><br />
      <span className="sub" style=${{ fontSize: 9.5 }}>${fn}</span>
    </span>
  </div>`;
}

function Catalog() {
  const [prio, setPrio] = useState(7);
  const [minV, setMinV] = useState(260);
  const [maxV, setMaxV] = useState(null);
  const [ee, setEe] = useState(3);
  const [sets, setSets] = useState(['SpeedSet']);
  const [one, setOne] = useState(null);
  const [chk, setChk] = useState(true);
  const [tab, setTab] = useState('a');
  const [modal, setModal] = useState(false);

  const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 };
  const rowWrap = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' };

  return html`<${C.Scrollable} style=${{ height: '100%', padding: 20 }}>
    <h1 style=${{ margin: '0 0 4px', fontSize: 20 }}>Estética & Componentes</h1>
    <p className="sub" style=${{ margin: '0 0 14px', fontSize: 12 }}>
      Catálogo vivo: cada componente aqui é o mesmo usado nas telas. Se mudar aqui, muda em tudo.
    </p>

    <${Section} title="Paleta · superfícies e texto">
      <div style=${grid4}>
        <${Swatch} token="--bg" name="bg" fn="fundo do app" />
        <${Swatch} token="--surface" name="surface" fn="caixas / painéis" />
        <${Swatch} token="--surface-2" name="surface-2" fn="campos / itens" />
        <${Swatch} token="--line" name="line" fn="bordas / divisórias" />
        <${Swatch} token="--text" name="text" fn="texto principal" />
        <${Swatch} token="--text-2" name="text-2" fn="texto secundário" />
        <${Swatch} token="--text-3" name="text-3" fn="texto terciário / placeholder" />
        <${Swatch} token="--muted" name="muted" fn="não-texto: borda, desativado" />
        <${Swatch} token="--accent" name="accent" fn="ação / seleção" />
      </div>
    <//>

    <${Section} title="Paleta · semântica e raridade">
      <div style=${grid4}>
        <${Swatch} token="--ok" name="ok" fn="sobra · bateu · vitória" />
        <${Swatch} token="--bad" name="bad" fn="falta · déficit" />
        <${Swatch} token="--epic" name="epic" fn="borda item épico" />
        <${Swatch} token="--heroic" name="heroic" fn="borda item heroico" />
        <${Swatch} token="--rare" name="rare" fn="borda item raro" />
        <${Swatch} token="--good" name="good" fn="item bom" />
        <${Swatch} token="--normal" name="normal" fn="item normal" />
        <${Swatch} token="--star" name="star" fn="estrelas de raridade" />
      </div>
    <//>

    <${Section} title="Escalas · ups (discreto 1–5) e heatmap (contínuo)">
      <div style=${rowWrap}>
        <span style=${{ display: 'flex', gap: 4 }}>
          ${[1, 2, 3, 4, 5].map((n) => html`<span key=${n} title=${`${n} up`} style=${{ width: 26, height: 26,
            borderRadius: 7, background: theme.upColor(n) }}></span>`)}
        </span>
        <span className="sub" style=${{ fontSize: 10 }}>1 chevron por up · cinza→verde→azul→roxo→vermelho</span>
        <span style=${{ width: 220, height: 26, borderRadius: 7,
          background: `linear-gradient(90deg, ${theme.HEAT.join(',')})` }}></span>
        <span className="sub" style=${{ fontSize: 10 }}>heatmap contínuo (fundo de célula, por valor)</span>
      </div>
      <div style=${{ ...rowWrap, marginTop: 12 }}>
        ${[0, 0.25, 0.5, 0.75, 1].map((t) => html`<span key=${t} className="tnum" style=${{ fontSize: 10,
          padding: '4px 8px', borderRadius: 5, background: theme.heatColor(t, 0, 1) }}>${Math.round(t * 100)}%</span>`)}
        <span className="sub" style=${{ fontSize: 10 }}>← células interpoladas (não são 5 degraus)</span>
      </div>
    <//>

    <${Section} title="Botões, ícone-botão e abas">
      <div style=${rowWrap}>
        <${C.Button} variant="accent">Ação principal<//>
        <${C.Button} active=${true}>Ativo<//>
        <${C.Button}>Padrão<//>
        <${C.Button} variant="ghost">Ghost<//>
        <${C.Button} disabled=${true}>Desabilitado<//>
        <${C.IconButton} label="aplicar este valor"><${C.Glyph} name="arrow-left" /><//>
        <${C.IconButton} label="aplicar este valor" on=${true}><${C.Glyph} name="arrow-left" /><//>
        <${C.IconButton} label="aplicar tudo"><${C.Glyph} name="arrow-left-all" /><//>
        <${C.Button} variant="accent">Otimizador<${C.Glyph} name="arrow-right" /><//>
        <${C.Button} onClick=${() => setModal(true)}>Abrir modal<//>
      </div>
      <div style=${{ marginTop: 12 }}>
        <${C.Tabs} value=${tab} onChange=${setTab}
          items=${[{ id: 'a', label: 'Principal' }, { id: 'b', label: 'Comunidade' }, { id: 'c', label: 'Otimizador' }]} />
      </div>
    <//>

    <${Section} title="Campos: dropdown (único e múltiplo), chip, checkbox, número, stepper">
      <div style=${rowWrap}>
        <${C.Dropdown} options=${SET_OPTS} value=${one} onChange=${setOne} placeholder="Set 1" />
        <${C.Dropdown} options=${SET_OPTS} value=${sets} onChange=${setSets} multiple=${true} label="Sets" placeholder="Sets" />
        <${C.Chip} on=${true} icon=${html`<${C.SetIcon} set="SpeedSet" />`} onToggle=${() => {}}>Velocidade<//>
        <${C.Chip} icon=${html`<${C.SetIcon} set="CriticalSet" />`} onToggle=${() => {}}>Crítico<//>
        <${C.Checkbox} checked=${chk} onChange=${setChk} label="marcar" />
        <${C.Checkbox} checked=${false} onChange=${() => {}} label="marcar" />
        <span style=${{ width: 70 }}><${C.NumberField} value=${minV} onChange=${setMinV} placeholder="mín" /></span>
        <span style=${{ width: 70 }}><${C.NumberField} value=${maxV} onChange=${setMaxV} placeholder="máx" /></span>
        <${C.Stepper} value=${ee} onChange=${setEe} min=${0} max=${5} title="nível de EE" />
      </div>
    <//>

    <${Section} title="Barras">
      <div style=${{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px 14px', alignItems: 'center', maxWidth: 560 }}>
        <span className="sub" style=${{ fontSize: 10 }}>prioridade (vulto = arquétipo)</span>
        <${C.PriorityBar} value=${prio} ghost=${4} max=${10} onChange=${setPrio} />
        <span className="sub" style=${{ fontSize: 10 }}>qualidade 100%</span>
        <${C.QualityBar} ratio=${1} />
        <span className="sub" style=${{ fontSize: 10 }}>qualidade 72%</span>
        <${C.QualityBar} ratio=${0.72} />
        <span className="sub" style=${{ fontSize: 10 }}>qualidade 45%</span>
        <${C.QualityBar} ratio=${0.45} />
        <span className="sub" style=${{ fontSize: 10 }}>não exigido</span>
        <${C.QualityBar} neutral=${true} />
        <span className="sub" style=${{ fontSize: 10 }}>saldo (cor fixa)</span>
        <span style=${{ display: 'flex', gap: 14 }}>
          <b style=${{ color: 'var(--ok)' }}>+49</b><b style=${{ color: 'var(--bad)' }}>-18</b>
        </span>
      </div>
    <//>

    <${Section} title="Glifos da interface · SVG próprio (nunca caractere de texto)">
      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        ${C.GLYPH_NAMES.map((n) => html`<span key=${n} title=${n}
          style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            width: 78, padding: '10px 4px', background: 'var(--surface-2)',
            border: '1px solid var(--line)', borderRadius: 9 }}>
          <${C.Glyph} name=${n} size=${18} />
          <span className="sub" style=${{ fontSize: 8.5 }}>${n}</span>
        </span>`)}
      </div>
      <p className="sub" style=${{ fontSize: 10, margin: '10px 0 0' }}>
        Todos herdam a cor de quem os contém (<code>currentColor</code>), então o mesmo
        glifo serve em botão escuro, claro ou accent sem variante nova.
      </p>
    <//>

    <${Section} title="Scrollbar · discreta, com setas nas pontas, some sozinha">
      <div style=${rowWrap}>
        <${C.Box} style=${{ width: 250, height: 120, padding: 0, overflow: 'hidden' }}>
          <${C.Scrollable} style=${{ height: '100%', padding: 10 }}>
            ${Array.from({ length: 14 }).map((_, i) => html`<div key=${i} className="sub"
              style=${{ fontSize: 11, padding: '3px 0' }}>linha ${i + 1} — role para ver</div>`)}
          <//>
        <//>
        <${C.Box} style=${{ width: 250, height: 120, padding: 0, overflow: 'hidden' }}>
          <${C.Scrollable} horizontal=${true} style=${{ height: '100%', padding: 10 }}>
            <div style=${{ width: 640, fontSize: 11 }} className="sub">
              horizontal — mesmo traço, mesmas setinhas nas pontas
            </div>
          <//>
        <//>
        <span className="sub" style=${{ fontSize: 10, maxWidth: 300, lineHeight: 1.5 }}>
          Polegar fino (sem borda pintada na cor do fundo) e <b>setinhas só nas duas
          pontas</b>. Em repouso fica <b>apagada</b> — nunca some — e acende por fade ao
          passar o mouse no painel ou enquanto rola, voltando a apagar ~0,8s depois.
        </span>
      </div>
    <//>

    <${Section} title="Ranks, ícones e linha de status">
      <div style=${rowWrap}>
        ${theme.RANKS.map((r) => html`<${C.RankBadge} key=${r} rank=${r} score=${72.4} />`)}
      </div>
      <div style=${{ ...rowWrap, marginTop: 14 }}>
        <${C.Stars} count=${5} />
        <${C.SetIcon} set="SpeedSet" size=${18} />
        <${C.StatIcon} stat="spd" size=${18} />
        <${C.ElementIcon} element="fire" size=${18} />
        <${C.ClassIcon} role="assassin" size=${18} />
        <${C.Portrait} code="c1014" size=${38} />
        <span className="sub" style=${{ fontSize: 10 }}>← assets do jogo (placeholder cinza quando o arquivo falta)</span>
      </div>
      <div style=${{ maxWidth: 260, marginTop: 14 }}>
        <${C.StatRow} stat="spd" label="Velocidade" value=${html`<span className="tnum">241</span>`} />
        <${C.StatRow} stat="chc" label="Chance Crítica" value=${html`<span className="tnum">100%</span>`} />
      </div>
    <//>

    ${modal ? html`<${C.Modal} title="Exemplo de popout" onClose=${() => setModal(false)}>
      <p className="sub" style=${{ margin: 0 }}>É aqui que o popout do item vai morar (ver + simular up).</p>
    <//>` : ''}
  <//>`;
}

module.exports = { Catalog };
