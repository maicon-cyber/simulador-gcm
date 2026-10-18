const STORAGE_KEY = 'simulador_gcm_v2';
const API_KEY_STORAGE_KEY = 'gemini_api_key';
const QUESTOES_POR_DIA = 60;
const TOTAL_DIAS = 15;
const TOTAL_QUESTOES = QUESTOES_POR_DIA * TOTAL_DIAS;
const MAX_TAMANHO_TEXTO = 10000;

const DIAS_CRONOGRAMA = Array.from({ length: TOTAL_DIAS }, (_, index) => {
    const dia = index + 17;
    const id = `2026-10-${String(dia).padStart(2, '0')}`;
    return {
        id,
        rotulo: `Dia ${index + 1} (${dia}/10/2026)`
    };
});

function criarDadosVazios() {
    return { progressoDias: {}, materias: {}, erros: [] };
}

function textoValido(valor, maxLength = MAX_TAMANHO_TEXTO) {
    return typeof valor === 'string' && valor.trim().length > 0
        ? valor.slice(0, maxLength)
        : '';
}

function normalizarDados(valor) {
    const resultado = criarDadosVazios();
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return resultado;

    if (valor.progressoDias && typeof valor.progressoDias === 'object' && !Array.isArray(valor.progressoDias)) {
        DIAS_CRONOGRAMA.forEach(({ id }) => {
            const progresso = valor.progressoDias[id];
            if (!progresso || typeof progresso !== 'object') return;
            const feitas = Number.isSafeInteger(progresso.feitas)
                ? Math.min(QUESTOES_POR_DIA, Math.max(0, progresso.feitas))
                : 0;
            const acertos = Number.isSafeInteger(progresso.acertos)
                ? Math.min(feitas, Math.max(0, progresso.acertos))
                : 0;
            if (feitas > 0 || acertos > 0) resultado.progressoDias[id] = { feitas, acertos };
        });
    }

    if (valor.materias && typeof valor.materias === 'object' && !Array.isArray(valor.materias)) {
        Object.entries(valor.materias).forEach(([nome, estatistica]) => {
            const disciplina = textoValido(nome, 200);
            if (!disciplina || !estatistica || typeof estatistica !== 'object') return;
            const feitas = Number.isSafeInteger(estatistica.feitas)
                ? Math.min(TOTAL_QUESTOES, Math.max(0, estatistica.feitas))
                : 0;
            const acertos = Number.isSafeInteger(estatistica.acertos)
                ? Math.min(feitas, Math.max(0, estatistica.acertos))
                : 0;
            if (feitas > 0 || acertos > 0) resultado.materias[disciplina] = { feitas, acertos };
        });
    }

    if (Array.isArray(valor.erros)) {
        resultado.erros = valor.erros
            .filter(erro => erro && typeof erro === 'object' && !Array.isArray(erro))
            .map(erro => ({
                dia: DIAS_CRONOGRAMA.some(dia => dia.id === erro.dia) ? erro.dia : '',
                disciplina: textoValido(erro.disciplina, 200),
                enunciado: textoValido(erro.enunciado),
                correta: textoValido(erro.correta, 2000),
                comentario: textoValido(erro.comentario)
            }))
            .filter(erro => erro.disciplina && erro.enunciado && erro.correta && erro.comentario);
    }

    return resultado;
}

function carregarDadosSalvos() {
    try {
        const salvo = localStorage.getItem(STORAGE_KEY);
        if (!salvo) return criarDadosVazios();
        return normalizarDados(JSON.parse(salvo));
    } catch (erro) {
        if (erro instanceof SyntaxError) {
            let copiaPreservada = false;
            try {
                localStorage.setItem(`${STORAGE_KEY}_backup_${Date.now()}`, localStorage.getItem(STORAGE_KEY) || '');
                copiaPreservada = true;
            } catch (erroBackup) {
                console.error('Não foi possível criar uma cópia dos dados inválidos do painel.', erroBackup);
            }
            alert(copiaPreservada
                ? 'Os dados salvos do simulador estavam inválidos. Uma cópia foi preservada e o painel será aberto sem apagar esse arquivo de segurança.'
                : 'Os dados salvos do simulador estavam inválidos e não foi possível criar uma cópia. O painel será aberto sem esses dados; verifique o armazenamento antes de salvar novamente.');
        } else {
            console.error('Não foi possível ler os dados salvos do simulador.', erro);
            alert('Não foi possível acessar o armazenamento local. O progresso desta sessão pode não ser salvo.');
        }
        return criarDadosVazios();
    }
}

let dados = carregarDadosSalvos();
let diaAtualId = obterDiaInicial();
let questoesAtuais = [];
let questoesRespondidas = new Set();
let geracaoEmAndamento = false;

function obterDiaInicial() {
    const hoje = new Date();
    const idHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return DIAS_CRONOGRAMA.some(dia => dia.id === idHoje) ? idHoje : DIAS_CRONOGRAMA[0].id;
}

function escaparHtml(valor) {
    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function salvarDados(proximosDados) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(proximosDados));
        dados = proximosDados;
        carregarDashboard();
        return true;
    } catch (erro) {
        console.error('Não foi possível salvar o progresso do simulador.', erro);
        alert('Não foi possível salvar seu progresso neste navegador. Verifique o espaço disponível e as permissões de armazenamento antes de continuar.');
        return false;
    }
}

function salvarApiKey() {
    const input = document.getElementById('api-key-input');
    const valor = input.value.trim();
    if (!valor) {
        alert('Digite uma chave válida do Google AI Studio.');
        input.focus();
        return;
    }

    try {
        localStorage.setItem(API_KEY_STORAGE_KEY, valor);
        alert('Chave API salva neste navegador.');
    } catch (erro) {
        console.error('Não foi possível salvar a chave da API.', erro);
        alert('Não foi possível salvar a chave da API neste navegador. Verifique as permissões de armazenamento.');
    }
}

function selecionarDia(idDia) {
    if (geracaoEmAndamento) {
        alert('Aguarde a geração atual terminar antes de trocar o dia.');
        return;
    }
    if (!DIAS_CRONOGRAMA.some(dia => dia.id === idDia)) return;
    diaAtualId = idDia;
    questoesAtuais = [];
    questoesRespondidas.clear();
    document.getElementById('titulo-dia-selecionado').innerText =
        `${DIAS_CRONOGRAMA.find(dia => dia.id === idDia).rotulo} — Prova 60 Questões`;
    mostrarEstadoInicial();
    alternarAba('prova');
    carregarDashboard();
}

function mostrarEstadoInicial() {
    const area = document.getElementById('area-questoes');
    if (!area) return;
    area.innerHTML = `
        <div class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-10 text-center shadow-lg shadow-black/10 sm:px-10">
            <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                <svg aria-hidden="true" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14 3.5v5h5M8 13h8m-8 4h5"/>
                </svg>
            </div>
            <h3 class="text-base font-bold text-slate-200">Pronto para iniciar o treino?</h3>
            <p class="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">Selecione uma matéria e gere seu primeiro bloco de cinco questões para avançar na meta diária.</p>
            <p class="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1.5 text-xs font-medium text-amber-200/80">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                Meta do dia: 60 questões · Prova em 01/11/2026
            </p>
        </div>`;
}

function carregarDashboard() {
    const inputChave = document.getElementById('api-key-input');
    const listaDias = document.getElementById('lista-dias');
    const desempenhoMaterias = document.getElementById('desempenho-materias');
    if (!listaDias || !desempenhoMaterias) return;

    try {
        if (inputChave && !inputChave.value) inputChave.value = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
    } catch (erro) {
        console.error('Não foi possível carregar a chave da API.', erro);
    }

    listaDias.innerHTML = DIAS_CRONOGRAMA.map(dia => {
        const progresso = dados.progressoDias[dia.id] || { feitas: 0, acertos: 0 };
        const percentual = Math.min(100, Math.round((progresso.feitas / QUESTOES_POR_DIA) * 100));
        const ativo = dia.id === diaAtualId;
        return `
            <button type="button" onclick="selecionarDia('${dia.id}')" aria-pressed="${ativo}"
                class="w-full cursor-pointer rounded-xl border p-3 text-left transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${ativo ? 'border-blue-500/70 bg-blue-500/10 shadow-lg shadow-blue-950/20' : 'border-slate-800 bg-slate-950/60 hover:border-blue-500/50 hover:bg-slate-800/70'}">
                <span class="mb-2 flex items-center justify-between gap-2 text-xs font-bold">
                    <span class="${ativo ? 'text-white' : 'text-slate-300'}">${dia.rotulo}</span>
                    <span class="${progresso.feitas >= QUESTOES_POR_DIA ? 'text-emerald-400' : 'text-blue-300'}">${progresso.feitas} / ${QUESTOES_POR_DIA} questões</span>
                </span>
                <span class="block h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <span class="block h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300" style="width: ${percentual}%"></span>
                </span>
            </button>`;
    }).join('');

    const progressoAtual = dados.progressoDias[diaAtualId] || { feitas: 0, acertos: 0 };
    document.getElementById('stat-hoje').innerText = `${progressoAtual.feitas} / ${QUESTOES_POR_DIA}`;

    const totais = Object.values(dados.progressoDias).reduce((total, progresso) => ({
        feitas: total.feitas + progresso.feitas,
        acertos: total.acertos + progresso.acertos
    }), { feitas: 0, acertos: 0 });
    document.getElementById('stat-total').innerText = `${totais.feitas} / ${TOTAL_QUESTOES}`;
    document.getElementById('stat-acerto').innerText =
        `${totais.feitas > 0 ? Math.round((totais.acertos / totais.feitas) * 100) : 0}%`;
    document.getElementById('stat-erros').innerText = `${dados.erros.length} questões`;

    const materias = Object.entries(dados.materias);
    if (materias.length === 0) {
        desempenhoMaterias.innerHTML = '<p class="text-slate-500">Responda questões para ver seu desempenho por matéria.</p>';
    } else {
        desempenhoMaterias.innerHTML = materias.map(([nome, estatistica]) => {
            const percentual = estatistica.feitas > 0
                ? Math.round((estatistica.acertos / estatistica.feitas) * 100)
                : 0;
            const corTexto = percentual >= 70 ? 'text-emerald-400' : 'text-amber-400';
            const corBarra = percentual >= 70 ? 'bg-emerald-500' : 'bg-amber-500';
            return `
                <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div class="mb-2 flex items-start justify-between gap-3 font-semibold">
                        <span class="text-slate-300">${escaparHtml(nome)}</span>
                        <span class="shrink-0 ${corTexto}">${estatistica.acertos}/${estatistica.feitas} (${percentual}%)</span>
                    </div>
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div class="h-full rounded-full ${corBarra} transition-all duration-300" style="width:${percentual}%"></div>
                    </div>
                </div>`;
        }).join('');
    }

    const botaoGerar = document.getElementById('btn-gerar');
    if (botaoGerar && !geracaoEmAndamento) {
        const metaAtingida = progressoAtual.feitas >= QUESTOES_POR_DIA;
        botaoGerar.disabled = metaAtingida;
        botaoGerar.title = metaAtingida ? 'A meta diária de 60 questões foi atingida.' : '';
        botaoGerar.classList.toggle('cursor-not-allowed', metaAtingida);
        botaoGerar.classList.toggle('opacity-50', metaAtingida);
    }

    renderizarErros();
}

function limparJsonGerado(texto) {
    const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const inicio = limpo.indexOf('[');
    if (inicio < 0) throw new Error('A resposta da API não contém uma lista JSON de questões.');

    let profundidade = 0;
    let dentroDeString = false;
    let escape = false;
    for (let indice = inicio; indice < limpo.length; indice++) {
        const caractere = limpo[indice];
        if (dentroDeString) {
            if (escape) {
                escape = false;
            } else if (caractere === '\\') {
                escape = true;
            } else if (caractere === '"') {
                dentroDeString = false;
            }
            continue;
        }
        if (caractere === '"') {
            dentroDeString = true;
        } else if (caractere === '[') {
            profundidade++;
        } else if (caractere === ']') {
            profundidade--;
            if (profundidade === 0) return limpo.slice(inicio, indice + 1);
        }
    }
    throw new Error('A resposta JSON da API veio incompleta. Tente gerar o bloco novamente.');
}

function validarQuestoes(valor, disciplinaPadrao) {
    if (!Array.isArray(valor) || valor.length !== 5) {
        throw new Error('A API não retornou exatamente cinco questões. Tente gerar o bloco novamente.');
    }
    return valor.map((questao, indice) => {
        if (!questao || typeof questao !== 'object' || Array.isArray(questao)) {
            throw new Error(`A questão ${indice + 1} veio em formato inválido.`);
        }
        const disciplina = textoValido(questao.disciplina, 200) || disciplinaPadrao;
        const enunciado = textoValido(questao.enunciado);
        const comentario = textoValido(questao.comentario);
        const alternativas = questao.alternativas;
        if (!enunciado || !comentario || !Array.isArray(alternativas) ||
            alternativas.length !== 4 || alternativas.some(alternativa => !textoValido(alternativa, 2000)) ||
            !Number.isInteger(questao.correta) || questao.correta < 0 || questao.correta >= alternativas.length) {
            throw new Error(`A questão ${indice + 1} veio incompleta ou inválida. Tente gerar o bloco novamente.`);
        }
        return {
            disciplina,
            texto_apoio: textoValido(questao.texto_apoio),
            enunciado,
            alternativas: alternativas.map(alternativa => textoValido(alternativa, 2000)),
            correta: questao.correta,
            comentario
        };
    });
}

async function gerarBlocoQuestoes() {
    if (geracaoEmAndamento) return;
    const progressoAtual = dados.progressoDias[diaAtualId] || { feitas: 0, acertos: 0 };
    if (progressoAtual.feitas >= QUESTOES_POR_DIA) {
        alert('Você já atingiu a meta de 60 questões para este dia.');
        return;
    }

    let apiKey;
    try {
        apiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    } catch (erro) {
        console.error('Não foi possível ler a chave da API.', erro);
        alert('Não foi possível acessar a chave da API salva. Verifique as permissões de armazenamento.');
        return;
    }
    if (!apiKey) {
        alert('Insira sua chave Gemini API no topo do painel e clique em “Salvar”.');
        document.getElementById('api-key-input').focus();
        return;
    }

    const materia = document.getElementById('materia-select').value;
    const nomeCurto = materia.split('(')[0].trim();
    const botao = document.getElementById('btn-gerar');
    const textoOriginal = botao.textContent.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    geracaoEmAndamento = true;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = 'Gerando questões...';
    carregarDashboard();

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
        const endpoint = new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
        endpoint.searchParams.set('key', apiKey);
        const resposta = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
            }),
            signal: controller.signal
        });

        let retorno;
        try {
            retorno = await resposta.json();
        } catch (erro) {
            throw new Error(resposta.ok
                ? 'A API retornou uma resposta que não é JSON válido.'
                : `A API retornou erro HTTP ${resposta.status} e uma resposta inválida.`);
        }
        if (!resposta.ok || retorno.error) {
            throw new Error(retorno.error?.message || `Falha na API Gemini (HTTP ${resposta.status}).`);
        }

        const candidato = retorno.candidates?.[0];
        if (!candidato) {
            const motivo = retorno.promptFeedback?.blockReason;
            throw new Error(motivo
                ? `A solicitação foi bloqueada pela API (${motivo}). Revise o conteúdo e tente novamente.`
                : 'A API não retornou questões. Tente novamente.');
        }
        if (candidato.finishReason === 'MAX_TOKENS') {
            throw new Error('A resposta da API foi cortada por limite de tamanho. Tente gerar o bloco novamente.');
        }
        const textoResposta = candidato.content?.parts
            ?.map(parte => parte && typeof parte.text === 'string' ? parte.text : '')
            .join('')
            .trim();
        if (!textoResposta) throw new Error('A API retornou uma resposta vazia. Tente novamente.');

        let dadosBrutos;
        try {
            dadosBrutos = JSON.parse(limparJsonGerado(textoResposta));
        } catch (erro) {
            if (erro instanceof SyntaxError) {
                throw new Error('A resposta JSON da API veio inválida ou incompleta. Tente gerar o bloco novamente.');
            }
            throw erro;
        }
        const questoes = validarQuestoes(dadosBrutos, nomeCurto);
        renderizarQuestoes(questoes);
    } catch (erro) {
        const mensagem = erro.name === 'AbortError'
            ? 'A solicitação demorou demais e foi cancelada. Verifique sua conexão e tente novamente.'
            : erro instanceof TypeError
                ? 'Falha de rede ao acessar o Gemini. Verifique sua conexão e tente novamente.'
                : erro.message || 'Não foi possível gerar as questões.';
        console.error('Falha ao gerar questões do Gemini.', erro);
        alert(`Não foi possível gerar as questões: ${mensagem}`);
    } finally {
        clearTimeout(timeout);
        geracaoEmAndamento = false;
        botao.removeAttribute('aria-busy');
        botao.textContent = textoOriginal;
        carregarDashboard();
    }
}

function renderizarQuestoes(questoes) {
    alternarAba('prova');
    const container = document.getElementById('area-questoes');
    if (!container) return;
    questoesAtuais = questoes;
    questoesRespondidas = new Set();

    container.innerHTML = questoes.map((questao, indice) => `
        <article class="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-black/10 transition hover:border-slate-700 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider">
                <span class="text-blue-300">Questão ${indice + 1} · ${escaparHtml(questao.disciplina)}</span>
                <span class="rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-1 text-amber-200">Meta · ${diaAtualId}</span>
            </div>
            ${questao.texto_apoio ? `<div class="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300"><p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Texto de apoio</p><p class="whitespace-pre-line">${escaparHtml(questao.texto_apoio)}</p></div>` : ''}
            <p class="text-base font-semibold leading-relaxed text-slate-100">${escaparHtml(questao.enunciado)}</p>
            <div class="space-y-2" id="opcoes-${indice}">
                ${questao.alternativas.map((alternativa, indiceAlternativa) => `
                    <button type="button" onclick="responderQuestao(${indice},${indiceAlternativa})"
                        class="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-left text-sm leading-relaxed text-slate-300 transition duration-200 hover:border-blue-500/60 hover:bg-blue-500/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-80">
                        ${escaparHtml(alternativa)}
                    </button>
                `).join('')}
            </div>
            <div id="comentario-${indice}" class="hidden rounded-xl p-4 text-sm leading-relaxed"></div>
        </article>
    `).join('');
}

window.responderQuestao = function(indiceQuestao, indiceAlternativa) {
    const questao = questoesAtuais[indiceQuestao];
    if (!questao || questoesRespondidas.has(indiceQuestao) ||
        !Number.isInteger(indiceAlternativa) || indiceAlternativa < 0 ||
        indiceAlternativa >= questao.alternativas.length) return;

    const progressoAtual = dados.progressoDias[diaAtualId] || { feitas: 0, acertos: 0 };
    if (progressoAtual.feitas >= QUESTOES_POR_DIA) {
        alert('A meta de 60 questões deste dia já foi atingida.');
        carregarDashboard();
        return;
    }

    const acertou = indiceAlternativa === questao.correta;
    const proximosDados = JSON.parse(JSON.stringify(dados));
    const progresso = proximosDados.progressoDias[diaAtualId] || { feitas: 0, acertos: 0 };
    progresso.feitas++;
    if (acertou) progresso.acertos++;
    proximosDados.progressoDias[diaAtualId] = progresso;

    const estatistica = proximosDados.materias[questao.disciplina] || { feitas: 0, acertos: 0 };
    estatistica.feitas++;
    if (acertou) estatistica.acertos++;
    proximosDados.materias[questao.disciplina] = estatistica;

    if (!acertou) {
        proximosDados.erros.unshift({
            dia: diaAtualId,
            disciplina: questao.disciplina,
            enunciado: questao.enunciado,
            correta: questao.alternativas[questao.correta],
            comentario: questao.comentario
        });
    }

    if (!salvarDados(proximosDados)) return;
    questoesRespondidas.add(indiceQuestao);

    const botoes = document.querySelectorAll(`#opcoes-${indiceQuestao} button`);
    botoes.forEach(botao => {
        botao.disabled = true;
        botao.classList.remove('hover:border-blue-500/60', 'hover:bg-blue-500/5', 'hover:text-white');
    });
    if (botoes[questao.correta]) {
        botoes[questao.correta].classList.add('border-emerald-500', 'bg-emerald-950/60', 'text-emerald-200', 'font-bold');
    }
    if (!acertou && botoes[indiceAlternativa]) {
        botoes[indiceAlternativa].classList.add('border-rose-500', 'bg-rose-950/60', 'text-rose-200');
    }

    const caixaComentario = document.getElementById(`comentario-${indiceQuestao}`);
    caixaComentario.className = `rounded-xl border p-4 text-sm leading-relaxed ${acertou ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-rose-800 bg-rose-950/40 text-rose-200'}`;
    caixaComentario.innerHTML = `<b>${acertou ? 'Resposta correta!' : 'Resposta incorreta · salva em Revisar erros'}</b><p class="mt-1 text-slate-300">${escaparHtml(questao.comentario)}</p>`;
}

function renderizarErros() {
    const area = document.getElementById('area-erros');
    if (!area) return;
    if (dados.erros.length === 0) {
        area.innerHTML = '<div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center text-slate-400 shadow-lg">Nenhum erro registrado. Continue praticando para preencher seu caderno de revisão.</div>';
        return;
    }
    area.innerHTML = dados.erros.map((erro, indice) => `
        <article class="space-y-3 rounded-2xl border border-rose-900/40 bg-slate-900/90 p-5 shadow-lg shadow-black/10">
            <div class="flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
                <span class="text-rose-300">${escaparHtml(erro.disciplina)}${erro.dia ? ` · ${escaparHtml(erro.dia)}` : ''}</span>
                <button type="button" onclick="removerErro(${indice})" class="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    Já revisei · Remover
                </button>
            </div>
            <p class="text-sm font-semibold leading-relaxed text-slate-100">${escaparHtml(erro.enunciado)}</p>
            <p class="text-sm font-bold text-emerald-300">Gabarito: ${escaparHtml(erro.correta)}</p>
            <p class="whitespace-pre-line rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-sm leading-relaxed text-slate-300">${escaparHtml(erro.comentario)}</p>
        </article>
    `).join('');
}

window.removerErro = function(indice) {
    if (!Number.isInteger(indice) || indice < 0 || indice >= dados.erros.length) return;
    const proximosDados = JSON.parse(JSON.stringify(dados));
    proximosDados.erros.splice(indice, 1);
    salvarDados(proximosDados);
}

window.selecionarDia = selecionarDia;

window.alternarAba = function(aba) {
    if (aba !== 'prova' && aba !== 'erros') return;
    const provaVisivel = aba === 'prova';
    document.getElementById('area-questoes')?.classList.toggle('hidden', !provaVisivel);
    document.getElementById('area-erros')?.classList.toggle('hidden', provaVisivel);
    const botaoProva = document.getElementById('btn-aba-prova');
    const botaoErros = document.getElementById('btn-aba-erros');
    botaoProva?.setAttribute('aria-pressed', String(provaVisivel));
    botaoErros?.setAttribute('aria-pressed', String(!provaVisivel));
    botaoProva?.classList.remove(
        'border-blue-400/30', 'bg-blue-500/15', 'text-blue-200',
        'border-slate-700', 'bg-slate-950/70', 'text-slate-300'
    );
    botaoProva?.classList.add(...(provaVisivel
        ? ['border-blue-400/30', 'bg-blue-500/15', 'text-blue-200']
        : ['border-slate-700', 'bg-slate-950/70', 'text-slate-300']));
    botaoErros?.classList.remove(
        'border-amber-400/30', 'bg-amber-500/10', 'text-amber-200',
        'border-slate-700', 'bg-slate-950/70', 'text-slate-300'
    );
    botaoErros?.classList.add(...(!provaVisivel
        ? ['border-amber-400/30', 'bg-amber-500/10', 'text-amber-200']
        : ['border-slate-700', 'bg-slate-950/70', 'text-slate-300']));
}

window.gerarBlocoQuestoes = gerarBlocoQuestoes;
window.salvarApiKey = salvarApiKey;

document.addEventListener('DOMContentLoaded', () => {
    mostrarEstadoInicial();
    const diaAtual = DIAS_CRONOGRAMA.find(dia => dia.id === diaAtualId);
    document.getElementById('titulo-dia-selecionado').innerText =
        `${diaAtual.rotulo} — Prova 60 Questões`;
    alternarAba('prova');
    carregarDashboard();
});
