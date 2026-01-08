/* --- CONFIGURAÇÃO E UTILITÁRIOS --- */
const COLLECTION_NAME = 'processos';

// Função para formatar data (YYYY-MM-DD -> DD/MM/YYYY)
const formatData = (dataISO) => {
    if (!dataISO) return '-';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
};

// Feedback Visual (Toasts)
function showToast(message) {
    const container = document.getElementById('toast-area');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Loading State (UX Humana)
function toggleLoading(isLoading) {
    // Tenta achar tabelas ou grids para mostrar loading
    const tableBody = document.getElementById('table-body') || document.getElementById('rep-body');
    if (tableBody) {
        if (isLoading) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">🔄 Sincronizando com a nuvem...</td></tr>';
        }
    }
}

/* --- CAMADA DE SERVIÇO (CONECTADA AO FIREBASE) --- */
const Service = {
    // Busca todos os dados do Firebase
    getAllData: async() => {
        try {
            const { collection, getDocs } = window.FirestoreFunctions;
            const db = window.FirebaseDB;

            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
            let lista = [];
            querySnapshot.forEach((doc) => {
                // Junta o ID do documento com os dados dele
                lista.push({ id: doc.id, ...doc.data() });
            });
            return lista;
        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            showToast("Erro de conexão com o servidor.");
            return [];
        }
    },

    // Salva ou Atualiza
    salvarProcesso: async(id, numero, responsavel, status) => {
        try {
            const { collection, addDoc, doc, updateDoc } = window.FirestoreFunctions;
            const db = window.FirebaseDB;
            const dados = { numero, responsavel, status };

            if (id) {
                // EDITAR
                const docRef = doc(db, COLLECTION_NAME, id);
                await updateDoc(docRef, dados);
                showToast("Processo atualizado na nuvem!");
            } else {
                // CRIAR NOVO
                dados.dataEntrada = new Date().toISOString().split('T')[0];
                await addDoc(collection(db, COLLECTION_NAME), dados);
                showToast("Processo salvo na nuvem!");
            }
            return true;
        } catch (e) {
            console.error("Erro ao salvar:", e);
            showToast("Erro ao salvar. Tente novamente.");
            return false;
        }
    },

    // Calcula Estatísticas (Feito no Front para economizar leituras)
    calcularKPIs: (lista) => {
        const pendentes = lista.filter(p => p.status === 'Pendente').length;
        const autorizados = lista.filter(p => p.status === 'Autorizado').length;
        const rejeitados = lista.filter(p => p.status === 'Rejeitado').length;
        const analisados = autorizados + rejeitados;
        const finalizados = analisados; // Regra de negócio atual

        return {
            total: lista.length,
            pendentes,
            autorizados,
            rejeitados,
            analisados,
            finalizados,
            listaCompleta: lista.sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada)) // Ordena por data
        };
    }
};

/* --- CONTROLADOR DE PÁGINAS --- */
// Aguarda o Firebase carregar antes de iniciar
window.addEventListener('load', () => {
    // Pequeno delay para garantir que o module do Firebase carregou
    setTimeout(() => {
        const pageId = document.body.id;
        if (pageId === 'page-dashboard') initDashboard();
        if (pageId === 'page-relatorios') initRelatorios();
        if (pageId === 'page-login') initLogin();
    }, 500);
});

function initLogin() {
    document.getElementById('form-login').addEventListener('submit', (e) => {
        e.preventDefault();
        window.location.href = 'dashboard.html';
    });
}

// --- LÓGICA: DASHBOARD ---
async function initDashboard() {
    toggleLoading(true);

    // 1. Busca dados
    const lista = await Service.getAllData();
    const stats = Service.calcularKPIs(lista);

    // 2. Renderiza
    renderKPIs(stats);
    renderTable(stats.listaCompleta);

    // 3. Configura Modal
    setupModal(lista);
}

function setupModal(listaAtual) {
    const modal = document.getElementById('modal-novo');
    const formProc = document.getElementById('form-processo');

    document.getElementById('btn-novo').onclick = () => openModal();
    document.getElementById('btn-cancel').onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

    // Remove listeners antigos para evitar duplicação (cloneNode trick)
    const newForm = formProc.cloneNode(true);
    formProc.parentNode.replaceChild(newForm, formProc);

    newForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const btnSave = newForm.querySelector('button[type="submit"]');
        const originalText = btnSave.innerText;
        btnSave.innerText = "Salvando...";
        btnSave.disabled = true;

        const id = document.getElementById('inp-id').value;
        const num = document.getElementById('inp-numero').value;
        const resp = document.getElementById('inp-resp').value;
        const status = document.getElementById('inp-status').value;

        const sucesso = await Service.salvarProcesso(id, num, resp, status);

        if (sucesso) {
            modal.classList.add('hidden');
            initDashboard(); // Recarrega tudo
        }

        btnSave.innerText = originalText;
        btnSave.disabled = false;
    });
}

function openModal(proc = null) {
    const modal = document.getElementById('modal-novo');
    const title = document.getElementById('modal-title');
    document.getElementById('form-processo').reset();
    document.getElementById('inp-id').value = "";

    if (proc) {
        title.innerText = "Editar Processo";
        document.getElementById('inp-id').value = proc.id;
        document.getElementById('inp-numero').value = proc.numero;
        document.getElementById('inp-resp').value = proc.responsavel;
        document.getElementById('inp-status').value = proc.status;
    } else {
        title.innerText = "Novo Processo";
    }
    modal.classList.remove('hidden');
}

// Função Global para editar (precisa buscar o objeto na lista atual)
window.editarProcesso = async function(id) {
    // Busca apenas o item localmente para abrir o modal rápido
    const lista = await Service.getAllData();
    const proc = lista.find(p => p.id === id);
    if (proc) openModal(proc);
};

function renderKPIs(stats) {
    document.getElementById('kpi-analisados').innerText = stats.analisados;
    document.getElementById('kpi-pendentes').innerText = stats.pendentes;
    document.getElementById('kpi-autorizados').innerText = stats.autorizados;
    document.getElementById('kpi-finalizados').innerText = stats.finalizados;
}

function renderTable(lista) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999; padding: 30px;">Nenhum processo encontrado.</td></tr>`;
        return;
    }

    lista.forEach(p => {
        const editIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

        // Passamos o ID como string
        tbody.innerHTML += `
            <tr>
                <td><strong>${p.numero}</strong></td>
                <td>${formatData(p.dataEntrada)}</td>
                <td>${p.responsavel}</td>
                <td><span class="badge badge-${p.status}">${p.status}</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick="editarProcesso('${p.id}')">
                        ${editIcon}
                    </button>
                </td>
            </tr>
        `;
    });
}

// --- LÓGICA: RELATÓRIOS ---
async function initRelatorios() {
    toggleLoading(true);
    const lista = await Service.getAllData();
    const stats = Service.calcularKPIs(lista);

    document.getElementById('rep-total').innerText = stats.total;
    const taxa = stats.total > 0 ? Math.round((stats.finalizados / stats.total) * 100) : 0;
    document.getElementById('rep-taxa').innerText = taxa + '%';

    updateBar('pend', stats.pendentes, stats.total);
    updateBar('auth', stats.autorizados, stats.total);
    updateBar('rej', stats.rejeitados, stats.total);

    const tbody = document.getElementById('rep-body');
    if (tbody) {
        tbody.innerHTML = '';
        stats.listaCompleta.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td>${formatData(p.dataEntrada)}</td>
                    <td>${p.numero}</td>
                    <td>${p.responsavel}</td>
                    <td>${p.status}</td>
                </tr>
            `;
        });
    }
}

function updateBar(id, val, total) {
    const pct = total > 0 ? (val / total) * 100 : 0;
    document.getElementById(`val-${id}`).innerText = val;
    document.getElementById(`bar-${id}`).style.width = `${pct}%`;
}