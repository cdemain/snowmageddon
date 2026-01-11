// Snowblower Comparator App
// Author: Grok
// Purpose: Calculate TCO for snowblower options
// Changes: Initial version
// TODO: Add sensitivity analysis
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
      <label>kWh per Use: <input type="number" step="0.1" value="0.75"></label>
      <label>Battery Life (years): <input type="number" value="7"></label>
      <label>Battery Replace Cost ($): <input type="number" value="500"></label>
    `;
  } else if (type === 'gas') {
    html += `
      <label>Gal per Use: <input type="number" step="0.1" value="0.75"></label>
    `;
  } else if (type === 'service') {
    html += `
      <label>Type: 
        <select>
          <option value="monthly">Monthly (Unlimited)</option>
          <option value="per-event">Per-Event</option>
        </select>
      </label>
      <label>Cost ($): <input type="number" value="0"></label> <!-- Monthly or per-event -->
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
      data.kwhPerUse = parseFloat(inputs[idx++].value);
      data.batteryLife = parseInt(inputs[idx++].value);
      data.batteryCost = parseFloat(inputs[idx++].value);
    } else if (type === 'gas') {
      data.galPerUse = parseFloat(inputs[idx++].value);
    } else if (type === 'service') {
      data.serviceType = inputs[idx++].value;
      data.cost = parseFloat(inputs[idx++].value);
      data.priceIncrease = parseFloat(inputs[idx++].value) / 100;
    }
    return data;
  });
}

function getGlobalInputs() {
  return {
    events: parseInt(document.getElementById('annual-events').value),
    elecCost: parseFloat(document.getElementById('elec-cost').value),
    gasCost: parseFloat(document.getElementById('gas-cost').value),
    inflation: parseFloat(document.getElementById('inflation').value) / 100
  };
}

function calculateTCO(option, globals, years) {
  let total = option.initial;
  let opCost = 0;
  let maintTotal = 0;
  let batteryReplaces = 0;

  for (let y = 1; y <= years; y++) {
    const inflFactor = Math.pow(1 + globals.inflation, y - 1);
    maintTotal += option.maint * inflFactor;

    if (option.type === 'electric') {
      opCost += globals.events * option.kwhPerUse * globals.elecCost * inflFactor;
      if (y % option.batteryLife === 0) batteryReplaces += option.batteryCost * inflFactor;
    } else if (option.type === 'gas') {
      opCost += globals.events * option.galPerUse * globals.gasCost * inflFactor;
    } else if (option.type === 'service') {
      let yearCost = option.cost;
      if (option.serviceType === 'monthly') {
        yearCost *= 12; // Assume monthly cost
      } else {
        yearCost *= globals.events;
      }
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

  let table = '<table><tr><th>Option</th><th>Short (2y)</th><th>Medium (5y)</th><th>Long (10y)</th></tr>';
  allOptions.forEach(opt => {
    table += `<tr><td>${opt.name} (${opt.type}${opt.type === 'service' ? ` - ${opt.serviceType}` : ''})</td>`;
    Object.values(horizons).forEach(h => {
      table += `<td>$${calculateTCO(opt, globals, h.years)}</td>`;
    });
    table += '</tr>';
  });
  table += '</table>';

  document.getElementById('results').innerHTML = '<h2>Results</h2>' + table;
}