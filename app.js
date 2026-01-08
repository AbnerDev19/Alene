/* --- IMPORTAÇÕES DO FIREBASE --- */
// Note que removemos a importação do 'firebase-storage' pois não vamos usar mais
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* --- CONFIGURAÇÃO --- */
const firebaseConfig = {
    apiKey: "AIzaSyDAjX4LQ8FER3k6lkFFzSVJdgnlx-WqdC0",
    authDomain: "projeto-alene.firebaseapp.com",
    projectId: "projeto-alene",
    storageBucket: "projeto-alene.firebasestorage.app",
    messagingSenderId: "159211713850",
    appId: "1:159211713850:web:20c721981195a2c7690c03",
    measurementId: "G-P61PNL7H7Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const COLLECTION_NAME = 'processos';

/* --- UTILITÁRIOS --- */
const formatData = (dataISO) => {
    if (!dataISO) return '-';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
};

function showToast(message) {
    const container = document.getElementById('toast-area');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function toggleLoading(isLoading) {
    const tableBody = document.getElementById('table-body') || document.getElementById('rep-body');
    if (tableBody && isLoading) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">🔄 Carregando dados...</td></tr>';
    }
}

// NOVO: Função que converte Arquivo para Texto (Base64)
const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

/* --- CAMADA DE SERVIÇO --- */
const Service = {
    getAllData: async() => {
        try {
            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
            let lista = [];
            querySnapshot.forEach((docSnap) => {
                lista.push({ id: docSnap.id, ...docSnap.data() });
            });
            return lista;
        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            // showToast("Erro de conexão. Verifique o console.");
            return [];
        }
    },

    salvarProcesso: async(id, numero, responsavel, status, anexoBase64) => {
        try {
            const dados = { numero, responsavel, status };

            // Se tiver um novo anexo (texto base64), salva ele
            if (anexoBase64) {
                dados.anexoUrl = anexoBase64;
            }

            if (id) {
                const docRef = doc(db, COLLECTION_NAME, id);
                await updateDoc(docRef, dados);
                showToast("Processo atualizado!");
            } else {
                dados.dataEntrada = new Date().toISOString().split('T')[0];
                if (!dados.anexoUrl) dados.anexoUrl = "";
                await addDoc(collection(db, COLLECTION_NAME), dados);
                showToast("Novo processo criado!");
            }
            return true;
        } catch (e) {
            console.error("Erro ao salvar:", e);
            if (e.code === 'permission-denied') {
                showToast("Erro: Permissão negada. Você está logado?");
            } else if (e.toString().includes("exceeds the maximum allowed size")) {
                showToast("Erro: Arquivo muito grande para este método. Use arquivos menores.");
            } else {
                showToast("Erro ao salvar no banco.");
            }
            return false;
        }
    },

    calcularKPIs: (lista) => {
        const pendentes = lista.filter(p => p.status === 'Pendente').length;
        const autorizados = lista.filter(p => p.status === 'Autorizado').length;
        const rejeitados = lista.filter(p => p.status === 'Rejeitado').length;
        const analisados = autorizados + rejeitados;
        const finalizados = analisados;

        return {
            total: lista.length,
            pendentes,
            autorizados,
            rejeitados,
            analisados,
            finalizados,
            listaCompleta: lista.sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada))
        };
    }
};

/* --- CONTROLADOR DE PÁGINAS --- */
window.addEventListener('load', () => {
    const pageId = document.body.id;
    if (pageId === 'page-dashboard') initDashboard();
    if (pageId === 'page-relatorios') initRelatorios();
    if (pageId === 'page-login') initLogin();
});

/* --- LÓGICA: LOGIN --- */
function initLogin() {
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async(e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            try {
                await signInWithEmailAndPassword(auth, email, pass);
                window.location.href = 'dashboard.html';
            } catch (error) {
                alert("Erro no login: " + error.message);
            }
        });
    }

    const btnGoogle = document.getElementById('btn-google');
    if (btnGoogle) {
        btnGoogle.addEventListener('click', async() => {
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
                window.location.href = 'dashboard.html';
            } catch (error) {
                console.error(error);
                alert("Erro ao entrar com Google.");
            }
        });
    }
}

/* --- LÓGICA: DASHBOARD --- */
async function initDashboard() {
    toggleLoading(true);
    const lista = await Service.getAllData();
    const stats = Service.calcularKPIs(lista);
    renderKPIs(stats);
    renderTable(stats.listaCompleta);
    setupModal(lista);
}

function setupModal(listaAtual) {
    const modal = document.getElementById('modal-novo');
    const formProc = document.getElementById('form-processo');
    const btnNovo = document.getElementById('btn-novo');
    const btnCancel = document.getElementById('btn-cancel');

    if (btnNovo) btnNovo.onclick = () => openModal();
    if (btnCancel) btnCancel.onclick = () => modal.classList.add('hidden');
    if (modal) modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

    if (formProc) {
        const newForm = formProc.cloneNode(true);
        formProc.parentNode.replaceChild(newForm, formProc);

        newForm.addEventListener('submit', async(e) => {
            e.preventDefault();
            const btnSave = newForm.querySelector('button[type="submit"]');
            const originalText = btnSave.innerText;

            btnSave.innerText = "Processando...";
            btnSave.disabled = true;

            const id = document.getElementById('inp-id').value;
            const num = document.getElementById('inp-numero').value;
            const resp = document.getElementById('inp-resp').value;
            const status = document.getElementById('inp-status').value;
            const arquivoInput = document.getElementById('inp-anexo');

            try {
                // 1. Converte o arquivo localmente para texto (Base64)
                let anexoString = null;
                if (arquivoInput.files.length > 0) {
                    const file = arquivoInput.files[0];
                    if (file.size > 800 * 1024) { // Limite de segurança de ~800KB
                        throw new Error("Arquivo muito grande. Use arquivos menores que 800KB.");
                    }
                    anexoString = await convertFileToBase64(file);
                }

                // 2. Salva no banco
                const sucesso = await Service.salvarProcesso(id, num, resp, status, anexoString);

                if (sucesso) {
                    modal.classList.add('hidden');
                    initDashboard();
                }
            } catch (error) {
                showToast("Erro: " + error.message);
            } finally {
                btnSave.innerText = originalText;
                btnSave.disabled = false;
            }
        });
    }
}

function openModal(proc = null) {
    const modal = document.getElementById('modal-novo');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('form-processo');
    const linkDiv = document.getElementById('link-atual');

    form.reset();
    document.getElementById('inp-id').value = "";
    linkDiv.innerHTML = "";

    if (proc) {
        title.innerText = "Editar Processo";
        document.getElementById('inp-id').value = proc.id;
        document.getElementById('inp-numero').value = proc.numero;
        document.getElementById('inp-resp').value = proc.responsavel;
        document.getElementById('inp-status').value = proc.status;

        if (proc.anexoUrl) {
            linkDiv.innerHTML = `📎 Processo com anexo salvo.`;
        }
    } else {
        title.innerText = "Novo Processo";
    }
    modal.classList.remove('hidden');
}

window.editarProcesso = async function(id) {
    const lista = await Service.getAllData();
    const proc = lista.find(p => p.id === id);
    if (proc) openModal(proc);
};

function renderKPIs(stats) {
    if (document.getElementById('kpi-analisados')) {
        document.getElementById('kpi-analisados').innerText = stats.analisados;
        document.getElementById('kpi-pendentes').innerText = stats.pendentes;
        document.getElementById('kpi-autorizados').innerText = stats.autorizados;
        document.getElementById('kpi-finalizados').innerText = stats.finalizados;
    }
}

function renderTable(lista) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding: 30px;">Nenhum processo encontrado.</td></tr>`;
        return;
    }

    const editIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

    lista.forEach(p => {
        let anexoBtn = '<span style="color:#ccc; font-size:0.8rem;">Sem anexo</span>';
        if (p.anexoUrl) {
            // Se for base64, funciona igual um link normal no navegador
            anexoBtn = `<a href="${p.anexoUrl}" target="_blank" class="btn btn-sm" style="font-size:0.75rem; padding:4px 8px;">📎 Abrir</a>`;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${p.numero}</strong></td>
                <td>${formatData(p.dataEntrada)}</td>
                <td>${p.responsavel}</td>
                <td><span class="badge badge-${p.status}">${p.status}</span></td>
                <td>${anexoBtn}</td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick="window.editarProcesso('${p.id}')">
                        ${editIcon}
                    </button>
                </td>
            </tr>
        `;
    });
}

/* --- LÓGICA: RELATÓRIOS --- */
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