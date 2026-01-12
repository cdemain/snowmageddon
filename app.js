// Snowblower Comparator App
// Author: Grok
// Purpose: Calculate TCO for snowblower options
// Changes: Updated electric calc to use battery Ah, voltage, base charges per event; added max cycles and calendar life for replacements; normalized scaleFactor to avg snow (6.5in/event)
// TODO: Add sensitivity analysis; optional service scaling with snow depth
// Bugs: None known

const horizons = {
  short: { years: 2 },
  medium: { years: 5 },
  long: { years: 10 }
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
    <label>Annual Maint ($): <input type="number" value="0"></label>
  `;

  if (type === 'electric') {
    html += `
      <label>Battery Size per Battery (Ah): <input type="number" step="0.1" value="7.5"></label>
      <label>Battery Voltage (V): <input type="number" value="56"></label>
      <label>Base Number of Charges per Event (for avg snow): <input type="number" step="0.1" value="1"></label>
      <label>Max Battery Cycles: <input type="number" value="1000"></label>
      <label>Battery Calendar Life (years): <input type="number" value="3"></label>
      <label>Battery Replace Cost ($): <input type="number" value="500"></label>
    `;
  } else if (type === 'gas') {
    html += `
      <label>Base Gal per Event (for avg snow): <input type="number" step="0.1" value="0.75"></label>
    `;
  } else if (type === 'service') {
    html += `
      <label>Type: 
        <select>
          <option value="monthly">Monthly (Unlimited)</option>
          <option value="per-event">Per-Event</option>
        </select>
      </label>
      <label>Base Cost ($): <input type="number" value="0"></label> <!-- Monthly, per-event, or scales with area/snow -->
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
      name: inputs[0].value,
      initial: parseFloat(inputs[1].value),
      maint: parseFloat(inputs[2].value)
    };

    let idx = 3;
    if (type === 'electric') {
      data.batteryAh = parseFloat(inputs[idx++].value);
      data.voltage = parseFloat(inputs[idx++].value);
      data.baseChargesPerEvent = parseFloat(inputs[idx++].value);
      data.maxCycles = parseInt(inputs[idx++].value);
      data.calendarLife = parseInt(inputs[idx++].value);
      data.batteryCost = parseFloat(inputs[idx++].value);
    } else if (type === 'gas') {
      data.baseGalPerEvent = parseFloat(inputs[idx++].value);
    } else if (type === 'service') {
      data.serviceType = inputs[idx++].value;
      data.baseCost = parseFloat(inputs[idx++].value);
      data.priceIncrease = parseFloat(inputs[idx++].value) / 100;
    }
    return data;
  });
}

function getGlobalInputs() {
  return {
    area: parseFloat(document.getElementById('area').value),
    events: parseInt(document.getElementById('snow-events').value),
    totalSnowfall: parseFloat(document.getElementById('total-snowfall').value),
    elecCost: parseFloat(document.getElementById('elec-cost').value),
    gasCost: parseFloat(document.getElementById('gas-cost').value),
    inflation: parseFloat(document.getElementById('inflation').value) / 100
  };
}

function estimateTonsPerEvent(globals, isBase = false) {
  const depthIn = isBase ? 6.5 : globals.totalSnowfall / globals.events;
  const depthFt = depthIn / 12;
  const volumeCuFt = globals.area * depthFt;
  const densityLbsPerCuFt = 12; // Avg for fresh snow
  const totalLbs = volumeCuFt * densityLbsPerCuFt;
  return totalLbs / 2000; // Tons
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
      const adjChargesPerEvent = option.baseChargesPerEvent * scaleFactor;
      const adjKwhPerEvent = adjChargesPerEvent * capacityKwh;
      opCost += globals.events * adjKwhPerEvent * globals.elecCost * inflFactor;

      currentAge++;
      const cyclesThisYear = globals.events * adjChargesPerEvent;
      currentCycles += cyclesThisYear;

      if (currentAge >= option.calendarLife || currentCycles >= option.maxCycles) {
        batteryReplaces += option.batteryCost * inflFactor;
        currentAge = 0;
        currentCycles = 0;
      }
    } else if (option.type === 'gas') {
      const adjGalPerEvent = option.baseGalPerEvent * scaleFactor;
      opCost += globals.events * adjGalPerEvent * globals.gasCost * inflFactor;
    } else if (option.type === 'service') {
      let yearCost = option.baseCost;
      if (option.serviceType === 'monthly') {
        yearCost *= 12; // Monthly cost
      } else {
        yearCost *= globals.events; // Per-event
      }
      yearCost *= (globals.area / 2000); // Simple scale from default 2000sqft
      const priceFactor = Math.pow(1 + option.priceIncrease, y - 1);
      opCost += yearCost * priceFactor * inflFactor;
    }
  }

  total += opCost + maintTotal + batteryReplaces;
  return Math.round(total);
}

function calculate() {
  const globals = getGlobalInputs();
  const allOptions = [
    ...getInputs('electric').map(o => ({ ...o, type: 'electric' })),
    ...getInputs('gas').map(o => ({ ...o, type: 'gas' })),
    ...getInputs('service').map(o => ({ ...o, type: 'service' }))
  ];

  if (allOptions.length === 0) {
    document.getElementById('results').innerHTML = '<p>Add at least one option.</p>';
    return;
  }

  const tonsPerEvent = estimateTonsPerEvent(globals);
  let intro = `<p>Estimated Tons per Event: ${tonsPerEvent.toFixed(2)}</p>`;

  let table = '<table><tr><th>Option</th><th>Short (2y)</th><th>Medium (5y)</th><th>Long (10y)</th></tr>';
  allOptions.forEach(opt => {
    table += `<tr><td>${opt.name} (${opt.type}${opt.type === 'service' ? ` - ${opt.serviceType}` : ''})</td>`;
    Object.values(horizons).forEach(h => {
      table += `<td>$${calculateTCO(opt, globals, h.years)}</td>`;
    });
    table += '</tr>';
  });
  table += '</table>';

  document.getElementById('results').innerHTML = '<h2>Results</h2>' + intro + table;
}