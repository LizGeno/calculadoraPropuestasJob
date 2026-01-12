// --- CONSTANTES ---
const TASAS = {
    ESPECIAL: { int: 0.015, uso: 0.003, mora: 0.04 },
    OPTIMO:   { int: 0.018, uso: 0.003, mora: 0.04 },
    RENTABLE: { int: 0.018, uso: 0.003, mora: 0.04 },
    LIBRE:    { int: 0.025, uso: 0.005, mora: 0.04 }
};

// --- ESTADO GLOBAL ---
let state = {
    deuda: 0,
    cuerpo: 0,
    dias: 0,
    fase: '', // SOFT, SOFT+, HARD
    tipo: 'ESPECIAL'
};

// Helper formato moneda
const fmt = (num) => num.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

// --- FUNCIÓN PRINCIPAL: CALCULAR TODO ---
function calcular() {
    // 1. Obtener inputs
    state.deuda = parseFloat(document.getElementById('inDeuda').value) || 0;
    state.cuerpo = parseFloat(document.getElementById('inCuerpo').value) || 0;
    state.dias = parseInt(document.getElementById('inDias').value) || 0;
    state.tipo = document.getElementById('tipoCredito').value;

    if (state.deuda === 0 || state.cuerpo === 0) return;

    determinarFase();
    actualizarUI();
    
    // Ejecutar submódulos
    calcRefinanciacion();
    calcProFromPorc(); // Lógica Prórroga
    calcDescuentos();
    // Vacaciones se calcula al clicar, pero reseteamos valores
    document.getElementById('vacPago').innerText = '€0.00';
    document.getElementById('vacDias').innerText = '0';
    document.getElementById('projDeuda').innerText = '€0.00';
    
    // Calcular cuotas por defecto
    calcularCuotas();
}

function determinarFase() {
    const d = state.dias;
    const badge = document.getElementById('phaseDisplay');
    badge.className = 'phase-badge';

    if (d <= 15) {
        state.fase = 'SOFT';
        badge.innerText = `FASE: SOFT (DÍA ${d})`;
        badge.classList.add('phase-soft');
    } else if (d <= 35) {
        state.fase = 'SOFT+';
        badge.innerText = `FASE: SOFT+ (DÍA ${d})`;
        badge.classList.add('phase-soft-plus');
    } else {
        state.fase = 'HARD';
        badge.innerText = `FASE: HARD (DÍA ${d})`;
        badge.classList.add('phase-hard');
    }
}

function actualizarUI() {
    // Activar/Desactivar tarjetas según reglas
    const d = state.dias;

    // A. Refinanciación: Siempre activa (desde día 1/-5)
    toggleCard('cardRefin', true);

    // B. Prórroga: Día -3 a 7
    toggleCard('cardProrroga', d <= 7);

    // C. Descuento: Siempre activa (diferente lógica dentro)
    toggleCard('cardDescuento', true);

    // D. Vacaciones: Día 8+
    toggleCard('cardVacaciones', d >= 8);

    // E. Cuotas: Regla compleja
    // Soft+ (16+). Excepcional Soft (8+). Supervisor (1+).
    // Lo dejaremos visualmente activo desde día 1, pero el cálculo cambiará.
    toggleCard('cardCuotas', d >= 1);
}

function toggleCard(id, isActive) {
    const el = document.getElementById(id);
    if (isActive) el.classList.add('active');
    else el.classList.remove('active');
}

// --- A. REFINANCIACIÓN ---
function calcRefinanciacion() {
    const d = state.dias;
    let code = "Sin promo activa";
    
    if (d >= 1 && d <= 6) code = "SF35 (-35%)";
    else if (d >= 7 && d <= 15) code = "SFM (-40%)";
    else if (d >= 16 && d <= 35) code = "SP45 (-45%) [Dudoso]";
    else if (d > 35) code = "Consultar Supervisor";

    document.getElementById('promoCodeDisplay').innerText = code;
}

// --- B. PRÓRROGA (LÓGICA COMPLETA: FECHA + INVERSA + CRM) ---

// 1. Si el usuario escribe MONTOS (€) -> Calculamos %
function calcProFromMonto() {
    if (state.cuerpo === 0) return;
    const montoUser = parseFloat(document.getElementById('proMontoUser').value) || 0;
    
    // Regla de 3: (Monto / Cuerpo) * 100 = Porcentaje
    const porc = (montoUser / state.cuerpo) * 100;
    
    // Actualizamos el input de porcentaje (con 1 decimal)
    document.getElementById('proPorc').value = porc.toFixed(1);
    
    calcularProrrogaFinal();
}

// 2. Si el usuario escribe PORCENTAJE (%) -> Calculamos €
function calcProFromPorc() {
    if (state.cuerpo === 0) return;
    const porcUser = parseFloat(document.getElementById('proPorc').value) || 0;
    
    // Calculamos monto: Cuerpo * (Porcentaje / 100)
    const monto = state.cuerpo * (porcUser / 100);
    
    // Actualizamos el input de monto
    document.getElementById('proMontoUser').value = monto.toFixed(2);
    
    calcularProrrogaFinal();
}

// 3. CÁLCULO MAESTRO
function calcularProrrogaFinal() {
    if (state.deuda === 0 || state.cuerpo === 0) return;

    // --- A. OBTENER DATOS ---
    const diasExtra = parseInt(document.getElementById('proDias').value) || 0;
    const porc = parseFloat(document.getElementById('proPorc').value) || 0;
    
    // Si llegamos aquí sin haber calculado el monto (ej. cambio de días), recalculamos el monto visual
    const pagoHoy = state.cuerpo * (porc / 100);
    // Solo actualizamos el input visual si no tiene el foco (para no molestar al escribir)
    if (document.activeElement.id !== 'proMontoUser') {
        document.getElementById('proMontoUser').value = pagoHoy.toFixed(2);
    }

    // --- B. CALCULAR FECHA DE VENCIMIENTO ---
    // Fecha Hoy + Días Extra
    const fechaVenc = new Date();
    fechaVenc.setDate(fechaVenc.getDate() + diasExtra);
    const opcionesFecha = { day: '2-digit', month: '2-digit', year: 'numeric' };
    document.getElementById('proFechaVenc').innerText = fechaVenc.toLocaleDateString('es-ES', opcionesFecha);

    // --- C. VALIDACIÓN SEMÁFORO ---
    const warningBox = document.getElementById('proWarning');
    let minPorcPermitido = (diasExtra <= 7) ? 5 : (diasExtra <= 10 ? 10 : 15);

    if (porc < minPorcPermitido) {
        warningBox.style.display = 'block';
        warningBox.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <b>Cuidado:</b> Para ${diasExtra} días, mín <b>${minPorcPermitido}%</b>.`;
    } else {
        warningBox.style.display = 'none';
    }

    // --- D. ESCENARIO REAL (CON PRÓRROGA) ---
    // Su deuda baja momentáneamente
    let saldoRestante = state.deuda - pagoHoy;
    if (saldoRestante < 0) saldoRestante = 0;

    // Penalización del 20% al saldo pendiente
    const penalizacion = saldoRestante * 0.20;
    const deudaFinalConProrroga = saldoRestante + penalizacion;

    // --- E. ESCENARIO MIEDO (SIN HACER NADA - Proyección CRM) ---
    // Interés Simple sobre el Cuerpo
    let deudaProyectada = state.deuda;
    const tasa = TASAS[state.tipo]; 
    
    // Costo Diario = Cuerpo * (%Interés + %Uso + %Mora)
    const porcentajeDiarioTotal = tasa.int + tasa.uso + tasa.mora;
    const costoPorDia = state.cuerpo * porcentajeDiarioTotal;
    
    // Proyección Lineal
    const costoAcumuladoFuturo = costoPorDia * diasExtra;
    deudaProyectada += costoAcumuladoFuturo;

    // --- F. RENDERIZADO ---
    document.getElementById('proPagoHoy').innerText = fmt(pagoHoy);
    document.getElementById('proNuevoTotal').innerText = fmt(deudaFinalConProrroga);
    document.getElementById('proProyeccion').innerText = fmt(deudaProyectada);

    // Diferencia (Ahorro)
    let diferencia = deudaProyectada - deudaFinalConProrroga;
    if (diferencia < 0) diferencia = 0; 
    document.getElementById('proDiferencia').innerText = fmt(diferencia);
}

// --- C. DESCUENTO ---
function calcDescuentos() {
    // Si no hay datos, no hacemos nada
    if (state.deuda === 0 || state.cuerpo === 0) return;

    const cargos = state.deuda - state.cuerpo;
    const boxSoft = document.getElementById('descSoft');
    const boxHard = document.getElementById('descHard');
    const ahorroLabel = document.getElementById('ahorroDisplay');

    if (state.fase === 'SOFT') {
        // --- LÓGICA SOFT (1-15 Días) ---
        boxSoft.style.display = 'block';
        boxHard.style.display = 'none';

        // Fórmula: Cuerpo + (Cargos con descuento)
        const pago10 = state.cuerpo + (cargos * 0.90); // Descuenta 10% de cargos
        const pago12 = state.cuerpo + (cargos * 0.88); // Descuenta 12% de cargos
        const pago15 = state.cuerpo + (cargos * 0.85); // Descuenta 15% de cargos

        document.getElementById('dSoft10').innerText = fmt(pago10);
        document.getElementById('dSoft12').innerText = fmt(pago12);
        document.getElementById('dSoft15').innerText = fmt(pago15);
        
        const ahorro = state.deuda - pago15;
        ahorroLabel.innerText = "Ahorro Máx: " + fmt(ahorro);

    } else {
        // --- LÓGICA HARD / SOFT+ (+16 Días) ---
        boxSoft.style.display = 'none';
        boxHard.style.display = 'block';

        let factorMin = 1.4;
        let note = "Soft+: Min 1.4 cuerpos";
        
        if (state.fase === 'HARD') {
            factorMin = 1.2;
            note = "Hard: Min 1.2 cuerpos (Prioridad)";
        }

        // 1. Oferta Inicial (El PDF dice '2 cuerpos', pero no puede ser mayor a la deuda real)
        let offerStart = state.cuerpo * 2;
        if (offerStart > state.deuda) offerStart = state.deuda;

        // 2. Oferta Mínima (El piso de la negociación)
        let offerMin = state.cuerpo * factorMin;
        // Seguridad: Si la oferta Min es mayor que la deuda actual, mostramos deuda
        if (offerMin > state.deuda) offerMin = state.deuda;

        document.getElementById('dHardStart').innerText = fmt(offerStart);
        document.getElementById('dHardMin').innerText = fmt(offerMin);
        document.getElementById('factorLabel').innerText = factorMin;
        document.getElementById('descHardNote').innerText = note;
        
        const ahorro = state.deuda - offerMin;
        ahorroLabel.innerText = "Ahorro Máx: " + fmt(ahorro);
    }
}

// --- D. VACACIONES FINANCIERAS ---
// 1. Si clicamos los botones rápidos
function setVacacionesPreset(porc, dias) {
    document.getElementById('vacPorcUser').value = porc;
    document.getElementById('vacDiasSelect').value = dias;
    calcVacacionesFromPorc(); // Dispara el cálculo
}

// 2. Si el usuario escribe MONTOS (€) -> Calculamos %
function calcVacacionesFromMonto() {
    if (state.deuda === 0) return;
    const montoUser = parseFloat(document.getElementById('vacMontoUser').value) || 0;
    
    // Regla de 3: (Monto / Deuda) * 100 = Porcentaje
    const porc = (montoUser / state.deuda) * 100;
    
    // Actualizamos el input de porcentaje (con 1 decimal)
    document.getElementById('vacPorcUser').value = porc.toFixed(1);
    
    calcVacacionesFinal();
}

// 3. Si el usuario escribe PORCENTAJE (%) -> Calculamos €
function calcVacacionesFromPorc() {
    if (state.deuda === 0) return;
    const porcUser = parseFloat(document.getElementById('vacPorcUser').value) || 0;
    
    // Calculamos monto
    const monto = state.deuda * (porcUser / 100);
    
    // Actualizamos el input de monto
    document.getElementById('vacMontoUser').value = monto.toFixed(2);
    
    calcVacacionesFinal();
}

// 4. CÁLCULO FINAL Y VALIDACIONES
function calcVacacionesFinal() {
    const montoHoy = parseFloat(document.getElementById('vacMontoUser').value) || 0;
    const dias = parseInt(document.getElementById('vacDiasSelect').value) || 0;
    const porc = parseFloat(document.getElementById('vacPorcUser').value) || 0;

    // A. Mostrar Resultados Financieros
    const saldoRestante = state.deuda - montoHoy;
    
    document.getElementById('vacPago').innerText = fmt(montoHoy);
    // IMPORTANTE: Vacaciones congela la deuda. El restante es simplemente Total - Pagado.
    document.getElementById('vacRestante').innerText = fmt(saldoRestante);

    // B. Validación de Reglas (Semáforo)
    // Regla PDF: 30%->3d, 40%->5d, 50%->7d.
    const warning = document.getElementById('vacWarning');
    let cumpleRegla = true;

    // Lógica estricta de mínimos sugeridos
    if (dias >= 7 && porc < 50) cumpleRegla = false;       // Quiere 7 días con menos del 50%
    else if (dias >= 5 && dias < 7 && porc < 40) cumpleRegla = false; // Quiere 5 días con menos del 40%
    else if (dias >= 3 && dias < 5 && porc < 30) cumpleRegla = false; // Quiere 3 días con menos del 30%
    
    // Lógica inversa: Si pone mucho dinero (50%) pero pide pocos días (3), ES VÁLIDO (cumpleRegla = true).
    
    if (!cumpleRegla && montoHoy > 0) {
        warning.style.display = 'block';
        warning.innerText = `⚠️ Atención: Para ${dias} días se recomienda un mínimo del ${getMinPorc(dias)}%.`;
    } else if (montoHoy > 0 && porc < 30) {
        warning.style.display = 'block';
        warning.innerText = "⚠️ El pago mínimo para activar vacaciones suele ser 30%.";
    } else {
        warning.style.display = 'none';
    }
}

// Helper para saber qué % pide el sistema según días
function getMinPorc(dias) {
    if (dias >= 7) return 50;
    if (dias >= 5) return 40;
    return 30;
}

// --- E. CUOTAS ---
function calcularCuotas() {
    const list = document.getElementById('scheduleTable');
    list.innerHTML = '';
    
    if (state.deuda === 0) return;

    // 1. Determinar Entrada Mínima según fase
    let factorEntrada = 1.0; // Soft Default
    let minEntradaNominal = 50;

    if (state.fase === 'SOFT+') factorEntrada = 0.70;
    if (state.fase === 'HARD') factorEntrada = 0.50;

    let entrada = state.cuerpo * factorEntrada;
    
    // Regla Soft: bajar hasta 50 eur min
    if (state.fase === 'SOFT' && entrada < 50) entrada = 50;
    
    // Input visual
    document.getElementById('cuotaPorc').innerText = (factorEntrada * 100);
    document.getElementById('cuotaEntrada').innerText = fmt(entrada);
    
    const saldoFinanciar = state.deuda - entrada;
    document.getElementById('cuotaSaldo').innerText = fmt(saldoFinanciar);

    if (saldoFinanciar <= 0) {
        list.innerHTML = '<div style="padding:10px; color:green">La entrada cubre la deuda.</div>';
        return;
    }

    // 2. Generar Calendario
    const freq = parseInt(document.getElementById('cuotaFreq').value);
    let cant = parseInt(document.getElementById('cuotaCant').value);

    // Validar Restricciones
    // 30 dias max 3 cuotas
    if (freq === 30 && cant > 3) {
        cant = 3; 
        document.getElementById('cuotaCant').value = 3;
        alert("Máximo 3 cuotas para plazos mensuales.");
    }
    // 15 dias max 6 cuotas
    if (freq === 15 && cant > 6) {
        cant = 6;
        document.getElementById('cuotaCant').value = 6;
    }

    const montoCuota = saldoFinanciar / cant;
    const hoy = new Date();

    let html = '';
    
    // Fila Entrada
    html += `<div class="schedule-item" style="background:#eff6ff; font-weight:bold">
                <span>HOY (Entrada)</span> <span>${fmt(entrada)}</span>
             </div>`;

    for (let i = 1; i <= cant; i++) {
        const fechaPago = new Date();
        fechaPago.setDate(hoy.getDate() + (i * freq));
        
        const fechaStr = fechaPago.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit'});
        
        html += `<div class="schedule-item">
                    <span>Cuota ${i} (${fechaStr})</span> <span>${fmt(montoCuota)}</span>
                 </div>`;
    }

    list.innerHTML = html;
}





// Inicializar
window.onload = () => {
    // Valores demo
    // calcular();
};