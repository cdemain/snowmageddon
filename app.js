// Snowblower TCO Comparator
// Author: Grok (with user refinements)
// Purpose: Compare total cost of ownership for electric/gas snowblowers and service
// Version: 2026-01 - improved output formatting, battery pair cost clarity, visual best-value highlighting
// Changes:
//   - Added thousands separators
//   - Highlight lowest cost per horizon
//   - Clearer assumptions summary
//   - Battery replacement cost now explicitly for both batteries
// TODO:
//   - Add $/ton metric
//   - Sensitivity sliders
//   - Export CSV

const horizons = {
  short: { years: 2, label: "Short (2y)" },
  medium: { years: 5, label: "Medium (5y)" },
  long: { years: 10, label: "Long (10y)" }
};

let options = { electric: [], gas: [], service: [] };

function addOption(type) {
  const id = options[type].length;
  const container = document.getElementById(`${type}-options`);
  const div = document.createElement('div');
  div.className = 'option';
  div.id = `${type}-${id}`;

  let html = `
    <label>Name: <input type="text" value="${type.charAt(0).toUpperCase() + type.slice(1)} ${id + 1}"></label>
    <label>Initial Cost ($): <input type="number" value="0"></label>
    <label>Annual Maintenance ($): <input type="number" value="0"></label>
  `;

  if (type === 'electric') {
    html += `
      <label>Battery Size per Battery (Ah): <input type="number" step="0.1" value="7.5"></label>
      <label>Battery Voltage (V): <input type="number" value="56"></label>
      <label>Base Number of Charges per Event (avg snow): <input type="number" step="0.1" value="1"></label>
      <label>Max Battery Cycles: <input type="number" value="1000"></label>
      <label>Battery Calendar Life (years): <input type="number" value="3"></label>
      <label>Battery Replace Cost (for both batteries) ($): <input type="number" value="500"></label>
    `;
  } else if (type === 'gas') {
    html += `
      <label>Base Gallons per Event (avg snow): <input type="number" step="0.1" value="0.75"></label>
    `;
  } else if (type === 'service') {
    html += `
      <label>Type:
        <select>
          <option value="monthly">Monthly (Unlimited)</option>
          <option value="per-event">Per-Event</option>
        </select>
      </label>
      <label>Base Cost ($): <input type="number" value="0"></label>
      <label>Annual Price Increase (%): <input type="number" step="0.1" value="5"></label>
    `;
  }

  html += `<button onclick="removeOption('${type}', ${id})">Remove</button>`;
  div.innerHTML = html;
  container.appendChild(div);
  options[type].push(id);
}

function removeOption(type, id) {
  document.getElementById(`${type}-${id}`).remove();
  options[type] = options[type].filter(i => i !== id);
}

function getInputs(type) {
  return options[type].map(id => {
    const div = document.getElementById(`${type}-${id}`);
    const inputs = div.querySelectorAll('input, select');
    const data = {
      name: inputs[0].value.trim() || `${type} ${id+1}`,
      initial: parseFloat(inputs[1].value) || 0,
      maint: parseFloat(inputs[2].value) || 0
    };

    let idx = 3;
    if (type === 'electric') {
      data.batteryAh = parseFloat(inputs[idx++].value) || 7.5;
      data.voltage = parseFloat(inputs[idx++].value) || 56;
      data.baseChargesPerEvent = parseFloat(inputs[idx++].value) || 1;
      data.maxCycles = parseInt(inputs[idx++].value) || 1000;
      data.calendarLife = parseInt(inputs[idx++].value) || 3;
      data.batteryCost = parseFloat(inputs[idx++].value) || 500;  // for both batteries
    } else if (type === 'gas') {
      data.baseGalPerEvent = parseFloat(inputs[idx++].value) || 0.75;
    } else if (type === 'service') {
      data.serviceType = inputs[idx++].value;
      data.baseCost = parseFloat(inputs[idx++].value) || 0;
      data.priceIncrease = (parseFloat(inputs[idx++].value) || 5) / 100;
    }
    return data;
  });
}

function getGlobalInputs() {
  return {
    area: parseFloat(document.getElementById('area').value) || 2000,
    events: parseInt(document.getElementById('snow-events').value) || 18,
    totalSnowfall: parseFloat(document.getElementById('total-snowfall').value) || 100,
    elecCost: parseFloat(document.getElementById('elec-cost').value) || 0.25,
    gasCost: parseFloat(document.getElementById('gas-cost').value) || 3.53,
    inflation: (parseFloat(document.getElementById('inflation').value) || 5) / 100
  };
}

function estimateTonsPerEvent(globals, isBase = false) {
  const depthIn = isBase ? 6.5 : (globals.totalSnowfall / globals.events);
  const depthFt = depthIn / 12;
  const volumeCuFt = globals.area * depthFt;
  const densityLbsPerCuFt = 12; // average fresh snow
  return (volumeCuFt * densityLbsPerCuFt) / 2000;
}

function formatCurrency(num) {
  return '$' + Math.round(num).toLocaleString('en-US');
}

function calculateTCO(option, globals, years) {
  let total = option.initial;
  let opCost = 0;
  let maintTotal = 0;
  let batteryReplaces = 0;

  const baseTons = estimateTonsPerEvent(globals, true);
  const tonsPerEvent = estimateTonsPerEvent(globals);
  const scaleFactor = baseTons > 0 ? tonsPerEvent / baseTons : 1;

  let currentAge = 0;
  let currentCycles = 0;

  for (let y = 1; y <= years; y++) {
    const inflFactor = Math.pow(1 + globals.inflation, y - 1);
    maintTotal += option.maint * inflFactor;

    if (option.type === 'electric') {
      const capacityKwh = 2 * option.batteryAh * option.voltage / 1000;
      const adjCharges = option.baseChargesPerEvent * scaleFactor;
      const adjKwh = adjCharges * capacityKwh;
      opCost += globals.events * adjKwh * globals.elecCost * inflFactor;

      currentAge++;
      currentCycles += globals.events * adjCharges;

      if (currentAge >= option.calendarLife || currentCycles >= option.maxCycles) {
        batteryReplaces += option.batteryCost * inflFactor;
        currentAge = 0;
        currentCycles = 0;
      }
    } else if (option.type === 'gas') {
      const adjGal = option.baseGalPerEvent * scaleFactor;
      opCost += globals.events * adjGal * globals.gasCost * inflFactor;
    } else if (option.type === 'service') {
      let yearCost = option.baseCost;
      if (option.serviceType === 'monthly') yearCost *= 12;
      else yearCost *= globals.events;

      yearCost *= (globals.area / 2000); // simple area scaling
      const priceFactor = Math.pow(1 + option.priceIncrease, y - 1);
      opCost += yearCost * priceFactor * inflFactor;
    }
  }

  return total + opCost + maintTotal + batteryReplaces;
}

function calculate() {
  const globals = getGlobalInputs();
  const allOptions = [
    ...getInputs('electric').map(o => ({ ...o, type: 'electric' })),
    ...getInputs('gas').map(o => ({ ...o, type: 'gas' })),
    ...getInputs('service').map(o => ({ ...o, type: 'service' }))
  ];

  if (allOptions.length === 0) {
    document.getElementById('results').innerHTML = '<p style="color:darkred;">Please add at least one option to compare.</p>';
    return;
  }

  const tonsPerEvent = estimateTonsPerEvent(globals);
  const annualTons = tonsPerEvent * globals.events;

  // Calculate all TCOs
  const results = allOptions.map(opt => ({
    ...opt,
    short: calculateTCO(opt, globals, 2),
    medium: calculateTCO(opt, globals, 5),
    long: calculateTCO(opt, globals, 10)
  }));

  const minShort = Math.min(...results.map(r => r.short));
  const minMedium = Math.min(...results.map(r => r.medium));
  const minLong = Math.min(...results.map(r => r.long));

  // Sort by short-term cost for easier scanning
  results.sort((a, b) => a.short - b.short);

  let html = `
    <h2>Comparison Results</h2>
    <div style="background:#f8f9fa; padding:12px; border-radius:6px; margin-bottom:1em;">
      <strong>Assumptions:</strong> ${globals.events} events • ${globals.totalSnowfall} in total • ${globals.area.toLocaleString()} sqft<br>
      <strong>Est. Tons per Event:</strong> ${tonsPerEvent.toFixed(2)} • <strong>Annual Tons:</strong> ${annualTons.toFixed(0)}
    </div>

    <table>
      <thead>
        <tr>
          <th>Option</th>
          <th style="text-align:right">${horizons.short.label}</th>
          <th style="text-align:right">${horizons.medium.label}</th>
          <th style="text-align:right">${horizons.long.label}</th>
        </tr>
      </thead>
      <tbody>
  `;

  results.forEach(r => {
    const typeLabel = r.type === 'service' ? ` (${r.serviceType})` : '';
    html += `
      <tr>
        <td>${r.name}${typeLabel}</td>
        <td style="text-align:right${r.short === minShort ? '; font-weight:bold; color:#006400' : ''}">
          ${formatCurrency(r.short)}${r.short === minShort ? ' ★' : ''}
        </td>
        <td style="text-align:right${r.medium === minMedium ? '; font-weight:bold; color:#006400' : ''}">
          ${formatCurrency(r.medium)}${r.medium === minMedium ? ' ★' : ''}
        </td>
        <td style="text-align:right${r.long === minLong ? '; font-weight:bold; color:#006400' : ''}">
          ${formatCurrency(r.long)}${r.long === minLong ? ' ★' : ''}
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>

    <p style="font-size:0.9em; color:#555; margin-top:1.5em;">
      ★ = lowest cost in that time horizon • Inflation applied at ${globals.inflation*100}%/yr
    </p>
  `;

  document.getElementById('results').innerHTML = html;
}