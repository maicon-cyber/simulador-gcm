// Cronograma de 15 dias: 17/10/2026 até 31/10/2026 (60 questões por dia)
const DIAS_CRONOGRAMA = [];
for (let dia = 17; dia <= 31; dia++) {
    DIAS_CRONOGRAMA.push({
        id: `2026-10-${dia}`,
        rotulo: `Dia ${dia - 16} (${dia}/10/2026)`
    });
}

let diaAtualId = '2026-10-17';

let dados = JSON.parse(localStorage.getItem('simulador_gcm_v2')) || {
    progressoDias: {}, // ex: { '2026-10-17': { feitas: 0, acertos: 0 } }
    materias: {},      // ex: { 'Língua Portuguesa': { feitas: 0, acertos: 0 } }
    erros: []
};

function salvarDados() {
    localStorage.setItem('simulador_gcm_v2', JSON.stringify(dados));
    carregarDashboard();
}

function salvarApiKey() {
    const val = document.getElementById('api-key-input').value.trim();
    if (!val) return alert('Digite uma chave válida do Google AI Studio!');
    localStorage.setItem('gemini_api_key', val);
    alert('Chave API salva com sucesso!');
}

function selecionarDia(idDia, rotulo) {
    diaAtualId = idDia;
    document.getElementById('titulo-dia-selecionado').innerText = `${rotulo} — Prova 60 Questões`;
    carregarDashboard();
}

function carregarDashboard() {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    const keyInput = document.getElementById('api-key-input');
    if (keyInput && savedKey) keyInput.value = savedKey;

    // Atualizar lista dos 15 dias (17/10 a 31/10)
    const listaDias = document.getElementById('lista-dias');
    if (listaDias) {
        listaDias.innerHTML = '';
        DIAS_CRONOGRAMA.forEach(d => {
            const prog = dados.progressoDias[d.id] || { feitas: 0, acertos: 0 };
            const pct = Math.min(100, Math.round((prog.feitas / 60) * 100));
            const ativo = d.id === diaAtualId ? 'border-blue-500 bg-slate-800/90' : 'border-slate-800 bg-slate-950/60';

            listaDias.innerHTML += `
                <div onclick="selecionarDia('${d.id}', '${d.rotulo}')" class="cursor-pointer p-3 rounded-xl border ${ativo} hover:border-blue-400 transition">
                    <div class="flex items-center justify-between text-xs font-bold mb-1">
                        <span>${d.rotulo}</span>
                        <span class="${prog.feitas >= 60 ? 'text-emerald-400' : 'text-blue-400'}">${prog.feitas} / 60 questões</span>
                    </div>
                    <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-blue-500 h-1.5" style="width: ${pct}%"></div>
                    </div>
                </div>`;
        });
    }

    // Atualizar contadores superiores
    const progHoje = dados.progressoDias[diaAtualId] || { feitas: 0, acertos: 0 };
    document.getElementById('stat-hoje').innerText = `${progHoje.feitas} / 60`;

    let totalFeitas = 0, totalAcertos = 0;
    Object.values(dados.progressoDias).forEach(p => {
        totalFeitas += p.feitas;
        totalAcertos += p.acertos;
    });

    document.getElementById('stat-total').innerText = `${totalFeitas} / 900`;
    const taxaGeral = totalFeitas > 0 ? Math.round((totalAcertos / totalFeitas) * 100) : 0;
    document.getElementById('stat-acerto').innerText = `${taxaGeral}%`;
    document.getElementById('stat-erros').innerText = `${dados.erros.length} questões`;

    // Desempenho por matéria
    const divMat = document.getElementById('desempenho-materias');
    divMat.innerHTML = '';
    const entradasMat = Object.entries(dados.materias);
    if (entradasMat.length === 0) {
        divMat.innerHTML = '<p class="text-slate-500">Responda questões para ver seu gráfico por matéria.</p>';
    } else {
        entradasMat.forEach(([nome, m]) => {
            const pct = m.feitas > 0 ? Math.round((m.acertos / m.feitas) * 100) : 0;
            divMat.innerHTML += `
                <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div class="flex justify-between font-semibold mb-1">
                        <span>${nome}</span>
                        <span class="${pct >= 70 ? 'text-emerald-400' : 'text-amber-400'}">${m.acertos}/${m.feitas} (${pct}%)</span>
                    </div>
                    <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div class="${pct >= 70 ? 'bg-emerald-500' : 'bg-amber-500'} h-1.5" style="width:${pct}%"></div>
                    </div>
                </div>`;
        });
    }

    renderizarErros();
}

async function gerarBlocoQuestoes() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        alert('Cole sua Chave Gemini API no topo da página e clique em "Salvar Key" primeiro!');
        return;
    }

    const materia = document.getElementById('materia-select').value;
    const nomeCurto = materia.split('(')[0].trim();
    const btn = document.getElementById('btn-gerar');
    btn.disabled = true;
    btn.innerText = '⏳ Gerando 5 questões...';

    const prompt = `Você é a banca Instituto CONSULPAM elaborando a prova da Guarda Civil Municipal de Sobral-CE (Edital 001/2026).
Gere exatamente 5 questões inéditas de múltipla escolha (A, B, C, D) da matéria: "${materia}".
Se for Língua Portuguesa, inclua obrigatoriamente um texto base realista em "texto_apoio" para interpretação e gramática. Se for Legislação, cobre a letra fria da Lei 13.022/2014, CTB, Constitucional, Penal ou legislação municipal.
Retorne APENAS um array JSON válido neste formato exato:
[
  {
    "disciplina": "${nomeCurto}",
    "texto_apoio": "Texto base se necessário ou vazio",
    "enunciado": "Enunciado completo padrão Consulpam",
    "alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correta": 0,
    "comentario": "Explicação detalhada do gabarito."
  }
]`;

    try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const json = await resp.json();
        if (json.error) throw new Error(json.error.message);

        const textoLimpo = json.candidates[0].content.parts[0].text.replace(/^```json|```$/g, '').trim();
        const questoes = JSON.parse(textoLimpo);
        renderizarQuestoes(questoes);
    } catch (e) {
        alert('Erro ao gerar questões na API: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = '⚡ Gerar +5 Questões';
    }
}

function renderizarQuestoes(questoes) {
    alternarAba('prova');
    const container = document.getElementById('area-questoes');
    container.innerHTML = '';
    window.questoesAtuais = questoes;

    questoes.forEach((q, idx) => {
        container.innerHTML += `
            <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
                <div class="flex justify-between text-xs font-bold text-blue-400 uppercase">
                    <span>Questão ${idx + 1} • ${q.disciplina}</span>
                    <span>Meta: ${diaAtualId}</span>
                </div>
                ${q.texto_apoio ? `<div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm text-slate-300 whitespace-pre-line leading-relaxed">${q.texto_apoio}</div>` : ''}
                <p class="font-semibold text-base">${q.enunciado}</p>
                <div class="space-y-2" id="opcoes-${idx}">
                    ${q.alternativas.map((alt, aIdx) => `
                        <button onclick="responderQuestao(${idx},${aIdx})" class="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-950 hover:border-blue-500 text-sm transition">
                            ${alt}
                        </button>
                    `).join('')}
                </div>
                <div id="comentario-${idx}" class="hidden p-4 rounded-xl text-sm"></div>
            </div>`;
    });
}

window.responderQuestao = function(qIdx, aIdx) {
    const q = window.questoesAtuais[qIdx];
    const botoes = document.querySelectorAll(`#opcoes-${qIdx} button`);
    botoes.forEach(b => b.disabled = true);

    const acertou = aIdx === q.correta;
    botoes[q.correta].classList.add('border-emerald-500', 'bg-emerald-950/60', 'text-emerald-300', 'font-bold');
    if (!acertou) {
        botoes[aIdx].classList.add('border-rose-500', 'bg-rose-950/60', 'text-rose-300');
    }

    const boxCom = document.getElementById(`comentario-${qIdx}`);
    boxCom.classList.remove('hidden');
    boxCom.className = `p-4 rounded-xl text-sm ${acertou ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-200' : 'bg-rose-950/40 border border-rose-800 text-rose-200'}`;
    boxCom.innerHTML = `<b>${acertou ? '✅ Resposta Correta!' : '❌ Você errou! (Salvo em Revisar Erros)'}</b><p class="mt-1 text-slate-300">${q.comentario}</p>`;

    if (!dados.progressoDias[diaAtualId]) dados.progressoDias[diaAtualId] = { feitas: 0, acertos: 0 };
    dados.progressoDias[diaAtualId].feitas++;
    if (acertou) dados.progressoDias[diaAtualId].acertos++;

    if (!dados.materias[q.disciplina]) dados.materias[q.disciplina] = { feitas: 0, acertos: 0 };
    dados.materias[q.disciplina].feitas++;
    if (acertou) {
        dados.materias[q.disciplina].acertos++;
    } else {
        dados.erros.unshift({
            dia: diaAtualId,
            disciplina: q.disciplina,
            enunciado: q.enunciado,
            correta: q.alternativas[q.correta],
            comentario: q.comentario
        });
    }

    salvarDados();
};

function renderizarErros() {
    const area = document.getElementById('area-erros');
    if (!area) return;
    if (dados.erros.length === 0) {
        area.innerHTML = '<div class="bg-slate-900 p-6 rounded-2xl border border-slate-800 text-center text-slate-400">Nenhum erro registrado até agora!</div>';
        return;
    }
    area.innerHTML = dados.erros.map((e, idx) => `
        <div class="bg-slate-900 p-5 rounded-2xl border border-rose-900/40 space-y-2">
            <div class="flex justify-between text-xs text-rose-400 font-bold">
                <span>${e.disciplina} • ${e.dia}</span>
                <button onclick="removerErro(${idx})" class="text-slate-400 hover:text-white">✔ Já revisei (Remover)</button>
            </div>
            <p class="text-sm font-semibold">${e.enunciado}</p>
            <p class="text-xs text-emerald-400 font-bold">Gabarito: ${e.correta}</p>
            <p class="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg">${e.comentario}</p>
        </div>
    `).join('');
}

window.removerErro = function(idx) {
    dados.erros.splice(idx, 1);
    salvarDados();
};

window.alternarAba = function(aba) {
    document.getElementById('area-questoes').classList.toggle('hidden', aba !== 'prova');
    document.getElementById('area-erros').classList.toggle('hidden', aba !== 'erros');
};

document.addEventListener('DOMContentLoaded', carregarDashboard);