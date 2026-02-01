// --- CONSTANTES ---
const TASAS = {
    ESPECIAL: { int: 0.015, uso: 0.003, mora: 0.04 },
    OPTIMO:   { int: 0.018, uso: 0.003, mora: 0.04 },
    RENTABLE: { int: 0.018, uso: 0.003, mora: 0.04 },
    LIBRE:    { int: 0.025, uso: 0.005, mora: 0.04 }
};

let state = { deuda: 0, cuerpo: 0, dias: 0, fase: '', tipo: 'ESPECIAL' };
// Variables globales para guardar los cálculos actuales de cuotas
let planActual = {
    entrada: 0,
    saldoA: 0, // Sin descuento
    saldoB: 0  // Con descuento
};

const fmt = (num) => num.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

// --- FUNCIÓN PRINCIPAL ---
function calcular() {
    state.deuda = parseFloat(document.getElementById('inDeuda').value) || 0;
    state.cuerpo = parseFloat(document.getElementById('inCuerpo').value) || 0;
    state.dias = parseInt(document.getElementById('inDias').value) || 0;
    state.tipo = document.getElementById('tipoCredito').value;

    if (state.deuda === 0) return;

    determinarFase();
    actualizarUI();
    
    calcRefinanciacion();
    
    if(document.getElementById('proMontoUser').value === "") calcProFromPorc();
    else calcularProrrogaFinal();

    calcDescuentos();  
    calcularCuotas(); // Ahora calcula y actualiza la comparativa
}

function determinarFase() {
    const d = state.dias;
    const badge = document.getElementById('phaseDisplay');
    const selector = document.getElementById('faseCuotasSelector');
    badge.className = 'phase-badge';

    // --- REGLAS DE DÍAS (FASES) ---
    if (d <= 17) {
        state.fase = 'SOFT'; 
        badge.innerText = `FASE: SOFT (DÍA ${d})`; 
        badge.classList.add('phase-soft');
        if(selector) selector.value = "SOFT"; // Auto-seleccionar en cuotas
    } else if (d <= 45) {
        state.fase = 'SOFT+'; 
        badge.innerText = `FASE: SOFT+ (DÍA ${d})`; 
        badge.classList.add('phase-soft-plus');
        if(selector) selector.value = "SOFT+";
    } else {
        state.fase = 'HARD'; 
        badge.innerText = `FASE: HARD (DÍA ${d})`; 
        badge.classList.add('phase-hard');
        if(selector) selector.value = "HARD";
    }
}

function actualizarUI() {
    const d = state.dias;
    const force = document.getElementById('forceMode').checked; 
    const hayDatos = state.deuda > 0;

    if (!hayDatos) return;

    const rules = {
        prorroga: d <= 7,
        vacaciones: d >= 8
    };

    toggleCard('cardRefin', true);
    toggleCard('cardDescuento', true);
    toggleCard('cardCuotas', true);
    toggleCard('cardProrroga', force || rules.prorroga);
    toggleCard('cardVacaciones', force || rules.vacaciones);
}

function toggleCard(id, isActive) {
    const el = document.getElementById(id);
    if (isActive) {
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
        el.style.filter = "none";
    } else {
        el.style.opacity = "0.5";
        el.style.pointerEvents = "none";
        el.style.filter = "grayscale(100%)";
    }
}

// --- A. REFINANCIACIÓN ---
function calcRefinanciacion() {
    const d = state.dias;
    let code = "Consultar";
    if (d <= 6) code = "SF35 (-35%)";
    else if (d <= 17) code = "SFM (-40%)";
    else if (d <= 45) code = "SP45 (-45%)";
    document.getElementById('promoCodeDisplay').innerText = code;
}

// --- B. PRÓRROGA ---
function calcProFromMonto() {
    if (state.cuerpo === 0) return;
    const monto = parseFloat(document.getElementById('proMontoUser').value) || 0;
    document.getElementById('proPorc').value = ((monto / state.cuerpo) * 100).toFixed(1);
    calcularProrrogaFinal();
}
function calcProFromPorc() {
    if (state.cuerpo === 0) return;
    const porc = parseFloat(document.getElementById('proPorc').value) || 0;
    document.getElementById('proMontoUser').value = (state.cuerpo * (porc / 100)).toFixed(2);
    calcularProrrogaFinal();
}
function calcularProrrogaFinal() {
    if (state.deuda === 0) return;
    const dias = parseInt(document.getElementById('proDias').value) || 0;
    const pagoHoy = parseFloat(document.getElementById('proMontoUser').value) || 0;
    
    const fecha = new Date(); fecha.setDate(fecha.getDate() + dias);
    document.getElementById('proFechaVenc').innerText = fecha.toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'});

    const tasa = TASAS[state.tipo];
    const moraDiaria = state.cuerpo * (tasa.int + tasa.uso + tasa.mora);
    const proyeccion = state.deuda + (moraDiaria * dias);

    document.getElementById('proPagoHoy').innerText = fmt(pagoHoy);
    document.getElementById('proProyeccion').innerText = fmt(proyeccion);
    
    const minPorc = dias <= 7 ? 5 : (dias <= 10 ? 10 : 15);
    const porcReal = (pagoHoy / state.cuerpo) * 100;
    const warn = document.getElementById('proWarning');
    if (porcReal < minPorc) {
        warn.style.display = 'block';
        warn.innerHTML = `⚠️ Para ${dias} días se recomienda cobar mín <b>${minPorc}%</b>.`;
    } else {
        warn.style.display = 'none';
    }
}

// --- C. DESCUENTO (SOFT+ EXPLÍCITO) ---
function calcDescuentos() {
    if (state.deuda === 0) return;
    const cargos = state.deuda - state.cuerpo;

    // 1. SOFT
    const p10 = state.cuerpo + (cargos * 0.90);
    const p12 = state.cuerpo + (cargos * 0.88);
    const p15 = state.cuerpo + (cargos * 0.85);
    document.getElementById('dSoft10').innerText = fmt(p10);
    document.getElementById('dSoft12').innerText = fmt(p12);
    document.getElementById('dSoft15').innerText = fmt(p15);

    // 2. SOFT+ (MOSTRAR LAS DOS CIFRAS)
    let startSoftPlus = state.cuerpo * 2;
    let minSoftPlus = state.cuerpo * 1.4;
    
    // Tope de seguridad
    if(startSoftPlus > state.deuda) startSoftPlus = state.deuda;
    if(minSoftPlus > state.deuda) minSoftPlus = state.deuda;

    document.getElementById('dSoftPlusStart').innerText = fmt(startSoftPlus);
    document.getElementById('dSoftPlusMin').innerText = fmt(minSoftPlus);

    // 3. HARD
    let startHard = state.cuerpo * 2;
    let minHard = state.cuerpo * 1.2;
    if(startHard > state.deuda) startHard = state.deuda;
    if(minHard > state.deuda) minHard = state.deuda;

    document.getElementById('dHardStart').innerText = fmt(startHard);
    document.getElementById('dHardMin').innerText = fmt(minHard);

    document.getElementById('ahorroDisplay').innerText = "Ahorro Máx: " + fmt(state.deuda - minHard);
}

// --- D. VACACIONES ---
function setVacacionesPreset(p, d) {
    document.getElementById('vacPorcUser').value = p;
    document.getElementById('vacDiasSelect').value = d;
    calcVacacionesFromPorc();
}
function calcVacacionesFromMonto() {
    const m = parseFloat(document.getElementById('vacMontoUser').value) || 0;
    if (state.deuda > 0) document.getElementById('vacPorcUser').value = ((m / state.deuda)*100).toFixed(1);
    calcVacacionesFinal();
}
function calcVacacionesFromPorc() {
    const p = parseFloat(document.getElementById('vacPorcUser').value) || 0;
    if (state.deuda > 0) document.getElementById('vacMontoUser').value = (state.deuda * (p/100)).toFixed(2);
    calcVacacionesFinal();
}
function calcVacacionesFinal() {
    const m = parseFloat(document.getElementById('vacMontoUser').value) || 0;
    document.getElementById('vacPago').innerText = fmt(m);
    document.getElementById('vacRestante').innerText = fmt(state.deuda - m);
}

// --- E. CUOTAS (REESTRUCTURACIÓN COMPARATIVA) ---
function calcularCuotas() {
    if (state.deuda === 0) return;

    // 1. Obtener Fase Seleccionada
    const faseSel = document.getElementById('faseCuotasSelector').value;
    
    // 2. Determinar Porcentaje de Entrada según Fase
    let factorEntrada = 1.0; // Default Soft
    if (faseSel === 'SOFT+') factorEntrada = 0.70;
    if (faseSel === 'HARD') factorEntrada = 0.50;

    let entrada = state.cuerpo * factorEntrada;
    if (faseSel === 'SOFT' && entrada < 50) entrada = 50; // Mínimo Soft
    // Tope de entrada no mayor a deuda
    if (entrada > state.deuda) entrada = state.deuda;

    // Guardamos la entrada calculada
    planActual.entrada = entrada;

    // 3. CALCULAR ESCENARIOS
    const cant = parseInt(document.getElementById('cuotaCant').value) || 1;
    
    // ESCENARIO A: SIN DESCUENTO (Deuda Total)
    let deudaA = state.deuda;
    let saldoA = deudaA - entrada;
    if(saldoA < 0) saldoA = 0;
    planActual.saldoA = saldoA;
    let cuotaA = saldoA / cant;

    // ESCENARIO B: CON DESCUENTO (2x Cuerpo)
    // Regla: Nueva deuda es 2xCuerpo. (Tope deuda real)
    let deudaB = state.cuerpo * 2;
    if (deudaB > state.deuda) deudaB = state.deuda; // No puede ser mayor a la real
    
    let saldoB = deudaB - entrada;
    if(saldoB < 0) saldoB = 0;
    planActual.saldoB = saldoB;
    let cuotaB = saldoB / cant;

    // 4. ACTUALIZAR UI COMPARATIVA
    // Plan A
    document.getElementById('valDeudaA').innerText = fmt(deudaA);
    document.getElementById('valEntradaA').innerText = fmt(entrada);
    document.getElementById('valCuotaA').innerText = fmt(cuotaA);

    // Plan B
    document.getElementById('valDeudaB').innerText = fmt(deudaB);
    document.getElementById('valEntradaB').innerText = fmt(entrada);
    document.getElementById('valCuotaB').innerText = fmt(cuotaB);

    // 5. RENDERIZAR CALENDARIO (Según selección)
    renderCalendar();
}

function renderCalendar() {
    const list = document.getElementById('scheduleTable');
    list.innerHTML = '';

    // Ver cuál radio está marcado
    const isDiscount = document.querySelector('input[name="planType"]:checked').value === 'DISCOUNT';
    const saldo = isDiscount ? planActual.saldoB : planActual.saldoA;
    const entrada = planActual.entrada;

    if (saldo <= 0) {
        list.innerHTML = '<div style="color:green; padding:5px; text-align:center;">¡La entrada cubre toda la deuda!</div>';
        return;
    }

    const cant = parseInt(document.getElementById('cuotaCant').value) || 1;
    const freq = parseInt(document.getElementById('cuotaFreq').value) || 15;
    
    // Validar frecuencia
    if (freq === 30 && cant > 3) {
        // Alerta visual opcional
    }

    const montoCuota = saldo / cant;
    const hoy = new Date();

    let html = `<div class="schedule-item" style="background:#e0f2fe; font-weight:bold; border-left: 4px solid #3b82f6;">
                    <span>HOY (Entrada)</span> <span>${fmt(entrada)}</span>
                </div>`;
    
    for(let i=1; i<=cant; i++) {
        const f = new Date(); 
        f.setDate(hoy.getDate() + (i*freq));
        html += `<div class="schedule-item">
                    <span>Cuota ${i} (${f.toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'})})</span>
                    <span>${fmt(montoCuota)}</span>
                 </div>`;
    }
    list.innerHTML = html;
}

window.onload = () => { };