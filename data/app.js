// ==========================================
// ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
let simuladoAtivo = null;
let questoes = [];
let respostasUsuario = {};
let tempoRestante = 14400; // 4 horas
let intervaloTimer = null;
let grafico = null;

// ==========================================
// INICIALIZAÇÃO E STORAGE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  carregarDashboard();
  const apiKey = localStorage.getItem('gemini_api_key');
  if(apiKey) document.getElementById('api-key-input').value = apiKey;
});

function salvarApiKey() {
  const key = document.getElementById('api-key-input').value;
  localStorage.setItem('gemini_api_key', key);
  alert("Chave Gemini salva localmente com sucesso!");
}

function getHistorico() {
  return JSON.parse(localStorage.getItem('gcm_historico')) || [];
}

function salvarResultado(idSimulado, pontosGerais, pontosEsp, notaTotal) {
  const historico = getHistorico();
  const index = historico.findIndex(h => h.id === idSimulado);
  const dataObj = { id: idSimulado, data: new Date().toLocaleDateString(), gerais: pontosGerais, especificas: pontosEsp, total: notaTotal };
  if(index >= 0) historico[index] = dataObj;
  else historico.push(dataObj);
  localStorage.setItem('gcm_historico', JSON.stringify(historico));
}

// ==========================================
// DASHBOARD E GRÁFICOS
// ==========================================
function carregarDashboard() {
  document.getElementById('view-dashboard').classList.remove('hidden');
  document.getElementById('view-prova').classList.add('hidden');
  document.getElementById('view-revisao').classList.add('hidden');
  document.querySelector('.id-btn-voltar').classList.add('hidden');

  const historico = getHistorico();
  
  // Atualizar Cards
  document.getElementById('dash-simulados-feitos').innerHTML = `${historico.length}<span class="text-lg text-slate-500">/23</span>`;
  const media = historico.length > 0 ? (historico.reduce((acc, curr) => acc + curr.total, 0) / historico.length).toFixed(1) : "0.0";
  document.getElementById('dash-media-pontos').innerHTML = `${media}<span class="text-lg text-slate-500">/90</span>`;

  // Renderizar Lista de Simulados (09/10 a 31/10)
  const lista = document.getElementById('lista-simulados');
  lista.innerHTML = '';
  let dataInicial = new Date(2026, 9, 9); // 09 de Outubro de 2026

  for (let i = 1; i <= 23; i++) {
    const feito = historico.find(h => h.id === i);
    const dataFormatada = dataInicial.toLocaleDateString('pt-BR').substring(0,5);
    
    lista.innerHTML += `
      <div class="flex items-center justify-between p-3 rounded-lg border ${feito ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-slate-900/50 border-slate-700'}">
        <div>
          <p class="font-bold text-white">Simulado ${String(i).padStart(2, '0')}</p>
          <p class="text-xs text-slate-400">Previsto para: ${dataFormatada}</p>
        </div>
        ${feito 
          ? `<span class="text-emerald-400 font-bold">${feito.total} pts</span>` 
          : `<button onclick="iniciarSimulado(${i})" class="bg-sky-600 hover:bg-sky-500 text-white text-xs px-4 py-2 rounded font-bold transition">INICIAR</button>`}
      </div>
    `;
    dataInicial.setDate(dataInicial.getDate() + 1);
  }

  // Desenhar Gráfico Chart.js
  const ctx = document.getElementById('graficoEvolucao').getContext('2d');
  if(grafico) grafico.destroy();
  
  grafico = new Chart(ctx, {
    type: 'line',
    data: {
      labels: historico.map(h => `Sim ${h.id}`),
      datasets: [{
        label: 'Nota Total (Máx 90)',
        data: historico.map(h => h.total),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      scales: { y: { min: 0, max: 90 } },
      plugins: { legend: { display: false } }
    }
  });
}

// ==========================================
// MOTOR DA PROVA
// ==========================================
async function iniciarSimulado(id) {
  try {
    const res = await fetch(`data/simulado_${String(id).padStart(2, '0')}.json`);
    if (!res.ok) throw new Error("Simulado não encontrado. Você já criou o arquivo JSON?");
    questoes = await res.json();
    
    simuladoAtivo = id;
    respostasUsuario = {};
    tempoRestante = 14400;

    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-prova').classList.remove('hidden');
    
    renderizarProva();
    iniciarTimer();
  } catch (error) {
    alert(error.message);
  }
}

function renderizarProva() {
  const container = document.getElementById('container-questoes');
  const grid = document.getElementById('grid-gabarito');
  container.innerHTML = '';
  grid.innerHTML = '';

  questoes.forEach((q, idx) => {
    const num = idx + 1;
    // Cartão da questão
    container.innerHTML += `
      <div id="q-${q.id}" class="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div class="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
          <span class="text-xs font-bold text-sky-400 uppercase tracking-widest">${q.materia}</span>
          <span class="text-xs text-slate-400 font-mono">Questão ${num} • Peso ${q.peso}</span>
        </div>
        <p class="text-base text-slate-200 mb-6 font-medium leading-relaxed">${q.enunciado}</p>
        <div class="space-y-3">
          ${['A', 'B', 'C', 'D'].map(alt => `
            <label class="flex items-start gap-4 p-4 rounded-lg bg-slate-900 hover:bg-slate-700 cursor-pointer border border-slate-700 transition">
              <input type="radio" name="resp-${q.id}" value="${alt}" onchange="marcarResposta(${q.id}, '${alt}',${num})" class="mt-1 w-4 h-4 text-sky-500 bg-slate-950 border-slate-600 focus:ring-sky-500 focus:ring-offset-slate-900">
              <span class="text-sm text-slate-300"><strong class="text-white">${alt})</strong>${q.alternativas[alt]}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;

    // Botão de navegação
    grid.innerHTML += `
      <button id="nav-${q.id}" onclick="document.getElementById('q-${q.id}').scrollIntoView({behavior:'smooth'})" class="w-full py-2 text-xs font-bold rounded bg-slate-900 text-slate-500 border border-slate-700 hover:bg-slate-700 transition">${num}</button>
    `;
  });
}

function marcarResposta(idQuestao, alternativa, numeroUI) {
  respostasUsuario[idQuestao] = alternativa;
  const btn = document.getElementById(`nav-${idQuestao}`);
  btn.classList.remove('bg-slate-900', 'text-slate-500');
  btn.classList.add('bg-sky-600', 'text-white', 'border-sky-500');
}

function iniciarTimer() {
  clearInterval(intervaloTimer);
  const display = document.getElementById('timer');
  intervaloTimer = setInterval(() => {
    if (tempoRestante <= 0) return finalizarProva();
    tempoRestante--;
    const h = String(Math.floor(tempoRestante / 3600)).padStart(2, '0');
    const m = String(Math.floor((tempoRestante % 3600) / 60)).padStart(2, '0');
    const s = String(tempoRestante % 60).padStart(2, '0');
    display.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// ==========================================
// CORREÇÃO E GEMINI AI
// ==========================================
function finalizarProva() {
  clearInterval(intervaloTimer);
  if(!confirm("Tem certeza que deseja entregar a prova?")) return { iniciarTimer };

  document.getElementById('view-prova').classList.add('hidden');
  document.getElementById('view-revisao').classList.remove('hidden');
  document.querySelector('.id-btn-voltar').classList.remove('hidden');

  let ptsGerais = 0, ptsEsp = 0;
  const containerRev = document.getElementById('container-revisao');
  containerRev.innerHTML = '';

  questoes.forEach((q, idx) => {
    const respondida = respostasUsuario[q.id];
    const acertou = respondida === q.gabarito;
    
    if (acertou) {
      if (q.peso === 1) ptsGerais += 1;
      else ptsEsp += 2;
    }

    // Renderizar Revisão
    const corBorda = acertou ? 'border-emerald-500/50' : 'border-rose-500/50';
    const icone = acertou ? '✅ Correto' : '❌ Incorreto';
    
    // Objeto limpo para enviar ao Gemini
    const promptGemini = encodeURIComponent(`Atue como um professor especialista em concursos da banca Consulpam. Explique detalhadamente por que a alternativa ${q.gabarito} está correta e as outras erradas nesta questão de ${q.materia}:\n\nEnunciado: ${q.enunciado}\nAlternativas:\nA) ${q.alternativas.A}\nB) ${q.alternativas.B}\nC) ${q.alternativas.C}\nD) ${q.alternativas.D}\n\nGabarito oficial: ${q.gabarito}. Minha resposta foi: ${respondida || 'Nenhuma'}.`);

    containerRev.innerHTML += `
      <div class="bg-slate-900 p-6 rounded-lg border ${corBorda}">
        <p class="text-xs text-slate-400 mb-2">Questão ${idx + 1} - ${q.materia}</p>
        <p class="text-sm text-white mb-4">${q.enunciado}</p>
        <div class="text-xs space-y-1 mb-4">
          <p><span class="text-slate-400">Sua resposta:</span> <span class="font-bold ${acertou ? 'text-emerald-400' : 'text-rose-400'}">${respondida || 'Em branco'}</span></p>
          <p><span class="text-slate-400">Gabarito Oficial:</span> <span class="font-bold text-emerald-400">${q.gabarito}</span></p>
        </div>
        <div class="flex gap-2">
          ${!acertou ? `<button onclick="chamarGemini('${promptGemini}', 'resposta-gemini-${q.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded font-bold transition flex items-center gap-1">🧠 Explicar com Gemini AI</button>` : ''}
        </div>
        <div id="resposta-gemini-${q.id}" class="mt-4 text-sm text-indigo-300 hidden p-4 bg-indigo-950/30 rounded border border-indigo-900/50 leading-relaxed"></div>
      </div>
    `;
  });

  const total = ptsGerais + ptsEsp;
  salvarResultado(simuladoAtivo, ptsGerais, ptsEsp, total);

  document.getElementById('rev-gerais').textContent = `${ptsGerais}/30`;
  document.getElementById('rev-esp').textContent = `${ptsEsp}/60`;
  document.getElementById('rev-total').textContent = `${total}/90`;

  const status = document.getElementById('rev-status');
  if (ptsGerais >= 15 && ptsEsp >= 30) {
    status.innerHTML = `<span class="text-emerald-400 font-bold">APROVADO NO CORTE</span> Manteve o padrão GCM.`;
  } else {
    status.innerHTML = `<span class="text-rose-400 font-bold">ELIMINADO</span> Não atingiu o perfil mínimo exigido no edital.`;
  }
}

async function chamarGemini(promptEscapado, divId) {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) return alert("Você precisa configurar sua API Key do Gemini no Dashboard primeiro!");

  const promptText = decodeURIComponent(promptEscapado);
  const divResposta = document.getElementById(divId);
  divResposta.classList.remove('hidden');
  divResposta.innerHTML = `<span class="animate-pulse">Analisando jurisprudência e doutrina...</span>`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });
    
    const data = await response.json();
    const textoMarkdown = data.candidates[0].content.parts[0].text;
    
    // Substitui quebras de linha por <br> e **texto** por <b>texto</b> básico
    divResposta.innerHTML = textoMarkdown.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>');
  } catch (error) {
    divResposta.innerHTML = `<span class="text-rose-400">Erro ao consultar Gemini. Verifique sua chave API.</span>`;
  }
}

function voltarDashboard() {
  carregarDashboard();
}