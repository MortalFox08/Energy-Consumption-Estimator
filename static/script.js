document.addEventListener('DOMContentLoaded', () => {
    // --- DATA ---
    const { jsPDF } = window.jspdf;
    const countryData = {
        'US': { name: 'United States', currency: '$', taxRate: 0.08, kgCO2perKwh: 0.37, tiers: [{ limit: 500, rate: 0.15 }, { limit: Infinity, rate: 0.20 }]},
        'IN': { name: 'India', currency: '₹', taxRate: 0.0, kgCO2perKwh: 0.82, tiers: [{ limit: 100, rate: 4.5 }, { limit: 300, rate: 7.0 }, { limit: Infinity, rate: 8.5 }]},
        'DE': { name: 'Germany', currency: '€', taxRate: 0.19, kgCO2perKwh: 0.34, tiers: [{ limit: Infinity, rate: 0.45 }]},
        'GB': { name: 'United Kingdom', currency: '£', taxRate: 0.20, kgCO2perKwh: 0.21, tiers: [{ limit: Infinity, rate: 0.34 }]}
    };
    const applianceDB = {
        "Television": 100, "Refrigerator": 150, "Air Conditioner": 1500, "Washing Machine": 500,
        "Microwave Oven": 1200, "Ceiling Fan": 75, "LED Bulb": 10, "Laptop": 65, "Desktop Computer": 200,
        "Water Heater": 3000, "Clothes Dryer": 3000, "Dishwasher": 1500, "Iron": 1100
    };
    const standardTipsDb = {
        'High Consumption': { title: 'Address High-Wattage Appliances', impact: 'High', description: 'Appliances like water heaters, dryers, and air conditioners are major energy consumers. Reduce their usage time, use them during off-peak hours, or consider upgrading to more efficient models.' },
        'Lighting': { title: 'Switch to LED Lighting', impact: 'Medium', description: 'If you still use incandescent or CFL bulbs, switching to LEDs can cut your lighting energy consumption by up to 80%.' },
        'General': { title: 'Unplug Unused Electronics', impact: 'Low', description: 'Address phantom load by unplugging chargers, TVs, and game consoles when not in use, or use a smart power strip.' }
    };
     const efficiencyMultipliers = {
        'standard': 0.7,
        'efficient': 0.65,
        'high_efficiency': 0.6
    };

    // --- STATE MANAGEMENT ---
    let state = {
        seasonalData: { annual: [], summer: [], winter: [] },
        currentSeason: 'annual',
        profiles: JSON.parse(localStorage.getItem('wattwise_profiles')) || {},
        currentProfileName: 'Default',
        savedEstimates: JSON.parse(localStorage.getItem('wattwise_estimates')) || [],
        currentEstimateResult: {}
    };

    // --- UI ELEMENTS ---
    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-btn');
    const seasonalTabs = document.querySelectorAll('.tab-btn');
    const countrySelect = document.getElementById('country');
    const currencySymbolRate = document.getElementById('currency-symbol-rate');
    const rateTiersContainer = document.getElementById('rate-tiers-container');
    const applianceListContainer = document.getElementById('appliance-list');
    const applianceSuggestions = document.getElementById('appliance-suggestions');
    const errorMessage = document.getElementById('error-message');
    const profileModal = document.getElementById('profile-modal');
    const profileModalTitle = document.getElementById('profile-modal-title');
    const profileModalBody = document.getElementById('profile-modal-body');
    const profileModalConfirm = document.getElementById('profile-modal-confirm');
    
    // --- INITIALIZATION ---
    function initialize() {
        populateCountrySelect();
        populateApplianceDatalist();
        loadStateFromStorage();
        renderApplianceList();
        updateUIForCountry();
        renderComparisonPage();
        addEventListeners();
        if (state.seasonalData.annual.length === 0) {
            createApplianceRow();
        }
    }

    function addEventListeners() {
        navButtons.forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
        seasonalTabs.forEach(tab => tab.addEventListener('click', () => switchSeason(tab.dataset.season)));
        countrySelect.addEventListener('change', updateUIForCountry);
        document.getElementById('add-appliance-btn').addEventListener('click', () => createApplianceRow());
        document.getElementById('add-tier-btn').addEventListener('click', () => { createRateTierRow(); manageTierInputs(); });
        applianceListContainer.addEventListener('click', handleApplianceListClick);
        rateTiersContainer.addEventListener('click', handleRateTiersClick);
        applianceListContainer.addEventListener('input', handleApplianceNameInput);
        document.getElementById('calculate-btn').addEventListener('click', handleCalculation);
        document.getElementById('view-suggestions-btn').addEventListener('click', () => switchPage('suggestions-page'));
        document.getElementById('view-savings-goal-btn').addEventListener('click', () => switchPage('savings-goal-page'));
        document.getElementById('download-pdf-btn').addEventListener('click', downloadPDF);
        document.getElementById('start-over-btn-results').addEventListener('click', () => switchPage('main-page'));
        document.getElementById('back-to-results-btn').addEventListener('click', () => switchPage('results-page'));
        document.getElementById('back-to-results-btn-from-goal').addEventListener('click', () => switchPage('results-page'));
        document.getElementById('save-estimate-btn').addEventListener('click', openSaveEstimateModal);
        document.getElementById('savings-goal-slider').addEventListener('input', updateSavingsGoalDisplay);
        document.getElementById('save-profile-btn').addEventListener('click', openSaveProfileModal);
        document.getElementById('load-profile-btn').addEventListener('click', openLoadProfileModal);
        document.getElementById('profile-modal-cancel').addEventListener('click', () => profileModal.classList.remove('active'));
    }

    // --- PAGE & VIEW LOGIC ---
    function switchPage(pageId) {
        window.scrollTo(0, 0);
        pages.forEach(page => page.classList.toggle('active', page.id === pageId));
        navButtons.forEach(btn => {
            btn.classList.toggle('border-green-600', btn.dataset.page === pageId);
            btn.classList.toggle('text-green-600', btn.dataset.page === pageId);
            btn.classList.toggle('border-transparent', btn.dataset.page !== pageId);
            btn.classList.toggle('text-gray-500', btn.dataset.page !== pageId);
        });
        if (pageId === 'comparison-page') renderComparisonPage();
    }
    
    function switchSeason(season) {
        saveCurrentAppliances();
        state.currentSeason = season;
        seasonalTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.season === season));
        renderApplianceList();
        if (!state.seasonalData[state.currentSeason] || state.seasonalData[state.currentSeason].length === 0) {
             createApplianceRow();
        }
    }

    // --- STATE & LOCAL STORAGE ---
    function loadStateFromStorage() {
        const storedProfileName = localStorage.getItem('wattwise_currentProfile') || 'Default';
        const freshData = { annual: [], summer: [], winter: [] };
        if (state.profiles[storedProfileName]) {
            // Use deep copy and merge with fresh data to ensure all seasons exist
            state.seasonalData = { ...freshData, ...JSON.parse(JSON.stringify(state.profiles[storedProfileName])) };
            state.currentProfileName = storedProfileName;
        } else {
            // If profile doesn't exist (e.g., first load), create it
            state.profiles[storedProfileName] = JSON.parse(JSON.stringify(freshData));
            state.seasonalData = JSON.parse(JSON.stringify(freshData));
            state.currentProfileName = storedProfileName;
        }
    }
    
    function saveStateToStorage() {
        saveCurrentAppliances();
        // Deep copy to prevent reference issues
        state.profiles[state.currentProfileName] = JSON.parse(JSON.stringify(state.seasonalData));
        localStorage.setItem('wattwise_profiles', JSON.stringify(state.profiles));
        localStorage.setItem('wattwise_currentProfile', state.currentProfileName);
        localStorage.setItem('wattwise_estimates', JSON.stringify(state.savedEstimates));
    }

    function saveCurrentAppliances() {
        const currentList = [];
        applianceListContainer.querySelectorAll('.appliance-item').forEach(item => {
            const name = item.querySelector('.appliance-name').value.trim();
            const wattage = item.querySelector('.appliance-wattage').value;
            const rating = item.querySelector('.appliance-rating').value;
            const hours = item.querySelector('.appliance-hours').value;
            if(name || wattage || hours) { // Only save if there's some data
                currentList.push({ name, wattage, rating, hours });
            }
        });
        state.seasonalData[state.currentSeason] = currentList;
    }
    
    // --- UI RENDERING & UPDATES ---
    function populateCountrySelect() {
        for (const code in countryData) {
            const option = document.createElement('option'); option.value = code; option.textContent = countryData[code].name;
            countrySelect.appendChild(option);
        }
    }

    function populateApplianceDatalist() {
        for (const name in applianceDB) {
            const option = document.createElement('option'); option.value = name;
            applianceSuggestions.appendChild(option);
        }
    }
    
    function updateUIForCountry() {
        const countryCode = countrySelect.value;
        const data = countryData[countryCode];
        currencySymbolRate.textContent = data.currency;
        rateTiersContainer.innerHTML = '';
        data.tiers.forEach(tier => createRateTierRow(tier.limit, tier.rate));
        manageTierInputs();
    }
    
    function renderApplianceList() {
        applianceListContainer.innerHTML = '';
        const currentList = state.seasonalData[state.currentSeason] || [];
        if (currentList.length > 0) {
            currentList.forEach(app => createApplianceRow(app.name, app.wattage, app.rating, app.hours));
        } else {
            createApplianceRow();
        }
    }

    function createApplianceRow(name = '', wattage = '', rating = 'standard', hours = '') {
        const div = document.createElement('div');
        div.className = 'appliance-item';
        div.innerHTML = `
            <input type="text" list="appliance-suggestions" placeholder="Appliance Name" class="appliance-name form-input" value="${name}">
            <input type="number" placeholder="Wattage (W)" class="appliance-wattage form-input" value="${wattage}">
            <select class="appliance-rating form-select">
                <option value="standard" ${rating === 'standard' ? 'selected' : ''}>Standard Efficiency</option>
                <option value="efficient" ${rating === 'efficient' ? 'selected' : ''}>Energy Efficient</option>
                <option value="high_efficiency" ${rating === 'high_efficiency' ? 'selected' : ''}>High Efficiency</option>
            </select>
            <input type="number" placeholder="Hrs/Day" class="appliance-hours form-input" value="${hours}" min="0" max="24" step="0.1">
            <button class="remove-appliance btn remove-btn">X</button>
        `;
        applianceListContainer.appendChild(div);
    }
    
    function createRateTierRow(limit = '', rate = '') {
        const div = document.createElement('div');
        div.className = 'rate-tier-item';
        const isInfinite = limit === Infinity || limit === 'Infinity';
        div.innerHTML = `
            <span>Up to</span>
            <input type="number" placeholder="kWh limit" class="rate-limit form-input" value="${isInfinite ? '' : limit}">
            <span>kWh @</span>
            <input type="number" placeholder="Rate" class="rate-value form-input" value="${rate}" step="0.01">
            <button class="remove-tier" style="color: #ef4444; font-weight: 700; background: none; border: none; cursor: pointer; padding: 0.5rem;">X</button>
        `;
        rateTiersContainer.appendChild(div);
    }
    
    function manageTierInputs() {
        const tiers = Array.from(rateTiersContainer.children);
        tiers.forEach((tier, index) => {
            const limitInput = tier.querySelector('.rate-limit');
            const removeBtn = tier.querySelector('.remove-tier');
            
            limitInput.disabled = (index === tiers.length - 1);
            removeBtn.style.display = (tiers.length > 1) ? 'block' : 'none';

            if (limitInput.disabled) {
                limitInput.value = '';
                limitInput.placeholder = 'And up';
            } else {
                limitInput.placeholder = 'kWh limit';
            }
        });
    }

    // --- EVENT HANDLERS ---
    function handleApplianceListClick(e) {
        if (e.target.classList.contains('remove-appliance')) {
            if (applianceListContainer.children.length > 1) {
                e.target.closest('.appliance-item').remove();
            }
        }
    }

    function handleRateTiersClick(e) {
        if (e.target.classList.contains('remove-tier')) {
             if (rateTiersContainer.children.length > 1) {
                e.target.closest('.rate-tier-item').remove();
                manageTierInputs();
             }
        }
    }

    function handleApplianceNameInput(e) {
        if (e.target.classList.contains('appliance-name')) {
            const name = e.target.value;
            if (applianceDB[name]) {
                const wattageInput = e.target.closest('.appliance-item').querySelector('.appliance-wattage');
                wattageInput.value = applianceDB[name];
            }
        }
    }

    // --- CALCULATION LOGIC ---
    async function handleCalculation() {
        errorMessage.classList.add('hidden');
        let isValid = true;
        
        saveCurrentAppliances();
        const appliances = state.seasonalData[state.currentSeason].filter(a => a.name && a.wattage > 0 && a.hours >= 0 && a.hours <= 24);

        const tiers = Array.from(document.querySelectorAll('.rate-tier-item')).map(item => {
            const limit = parseFloat(item.querySelector('.rate-limit').value) || Infinity;
            const rate = parseFloat(item.querySelector('.rate-value').value);
            if(isNaN(rate)) isValid = false;
            return { limit, rate };
        }).sort((a,b) => a.limit - b.limit);

        if (appliances.length === 0 || !isValid) {
            errorMessage.textContent = 'Please fill all fields correctly for at least one appliance and all rate tiers.';
            errorMessage.classList.remove('hidden');
            return;
        }

        switchPage('results-page');
        document.getElementById('progress-container').style.display = 'block';
        document.getElementById('results-display').classList.add('hidden');
        
        setTimeout(() => {
            const calculationResult = calculateBill(appliances, tiers);
            state.currentEstimateResult = { ...calculationResult, date: new Date().toISOString() };
            renderResults(state.currentEstimateResult);
            
            document.getElementById('progress-container').style.display = 'none';
            document.getElementById('results-display').classList.remove('hidden');
            
            generateStandardSuggestions(appliances);
        }, 2000);
    }

    function calculateBill(appliances, tiers) {
        let totalKwh = 0;
        const breakdown = [];

        // Phantom Load
        let phantomWattage = 0;
        document.querySelectorAll('.phantom-device:checked').forEach(d => phantomWattage += parseFloat(d.value));
        if(phantomWattage > 0) {
             appliances.push({name: "Phantom Load", wattage: phantomWattage, rating: 'standard', hours: 24});
        }

        appliances.forEach(app => {
            const multiplier = efficiencyMultipliers[app.rating] || 1;
            const monthlyKwh = (app.wattage * app.hours * 30 / 1000) * multiplier;
            totalKwh += monthlyKwh;
            breakdown.push({ name: app.name, kwh: monthlyKwh });
        });
        
        let subtotal = 0;
        let kwhRemaining = totalKwh;
        let lastLimit = 0;
        for(const tier of tiers) {
            const kwhInTier = Math.min(kwhRemaining, tier.limit - lastLimit);
            subtotal += kwhInTier * tier.rate;
            kwhRemaining -= kwhInTier;
            lastLimit = tier.limit;
            if(kwhRemaining <= 0) break;
        }

        const countryCode = countrySelect.value;
        const taxRate = countryData[countryCode].taxRate;
        const tax = subtotal * taxRate;
        const totalBill = subtotal + tax;

        if(totalKwh > 0){
            breakdown.forEach(item => {
                item.cost = (item.kwh / totalKwh) * subtotal;
            });
        }

        return { subtotal, tax, totalBill, breakdown, taxRate, currency: countryData[countryCode].currency, totalKwh, countryCode };
    }
    
    // --- RENDER RESULTS ---
    function renderResults({ subtotal, tax, totalBill, breakdown, taxRate, currency, totalKwh, countryCode }) {
        document.getElementById('subtotal-bill').textContent = `${currency}${subtotal.toFixed(2)}`;
        const taxRow = document.getElementById('tax-row');
        if (taxRate > 0) {
            taxRow.style.display = 'flex';
            document.getElementById('tax-rate-display').textContent = (taxRate * 100).toFixed(0);
            document.getElementById('tax-amount').textContent = `${currency}${tax.toFixed(2)}`;
        } else {
            taxRow.style.display = 'none';
        }
        document.getElementById('estimated-bill').textContent = `${currency}${totalBill.toFixed(2)}`;
        document.getElementById('carbon-footprint').textContent = `${(totalKwh * countryData[countryCode].kgCO2perKwh).toFixed(2)} kg CO₂`;
        
        setupSavingsGoal(totalBill, currency);
        renderDetailedBreakdown(breakdown, currency);
    }
    
    function renderDetailedBreakdown(breakdown, currency) {
        const container = document.getElementById('bill-breakdown-container');
        let tableHTML = `
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Appliance</th>
                        <th style="text-align: right;">Consumption (kWh)</th>
                        <th style="text-align: right;">Estimated Cost</th>
                    </tr>
                </thead>
                <tbody>`;
        
        breakdown.sort((a,b) => b.cost - a.cost).forEach(item => {
            tableHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td style="text-align: right;">${item.kwh.toFixed(1)}</td>
                    <td style="text-align: right; font-weight: 500;">${currency}${item.cost.toFixed(2)}</td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }
    
    // --- SAVINGS & SUGGESTIONS ---
    function setupSavingsGoal(totalBill, currency) {
        const slider = document.getElementById('savings-goal-slider');
        const min = Math.floor(totalBill * 0.7);
        const max = Math.ceil(totalBill * 1.3);
        slider.min = min;
        slider.max = max;
        slider.value = Math.floor(totalBill * 0.9);
        document.getElementById('savings-goal-min').textContent = `${currency}${min}`;
        document.getElementById('savings-goal-max').textContent = `${currency}${max}`;
        updateSavingsGoalDisplay();
    }

    function updateSavingsGoalDisplay() {
        const slider = document.getElementById('savings-goal-slider');
        const goalValue = parseFloat(slider.value);
        const currency = countryData[countrySelect.value].currency;
        document.getElementById('savings-goal-value').textContent = `${currency}${goalValue.toFixed(2)}`;
        
        const totalBill = state.currentEstimateResult.totalBill;
        const goalPercent = ((totalBill - slider.min) / (slider.max - slider.min)) * 100;
        document.getElementById('savings-goal-bar').style.width = `${goalPercent}%`;
        
        const markerPercent = ((goalValue - slider.min) / (slider.max - slider.min)) * 100;
        document.getElementById('savings-goal-marker').style.left = `${markerPercent}%`;
        const statusEl = document.getElementById('savings-status');

        if(totalBill <= goalValue) {
            document.getElementById('savings-goal-bar').classList.remove('bg-red-500');
            document.getElementById('savings-goal-bar').classList.add('bg-green-500');
            statusEl.textContent = `You are on track to meet your goal!`;
            statusEl.className = 'text-center font-semibold pt-2 text-green-600';
        } else {
            document.getElementById('savings-goal-bar').classList.remove('bg-green-500');
            document.getElementById('savings-goal-bar').classList.add('bg-red-500');
            statusEl.textContent = `You are currently over your budget goal.`;
            statusEl.className = 'text-center font-semibold pt-2 text-red-600';
        }
    }
    
    function generateStandardSuggestions(appliances) {
        const suggestionsList = document.getElementById('suggestions-list');
        suggestionsList.innerHTML = '';
        const tips = new Set();
        
        if (appliances.some(app => app.wattage > 1500)) {
            tips.add(standardTipsDb['High Consumption']);
        }
        if (appliances.some(app => app.name.toLowerCase().includes('bulb') || app.name.toLowerCase().includes('light'))) {
             tips.add(standardTipsDb['Lighting']);
        }
        tips.add(standardTipsDb['General']);

        tips.forEach(tip => {
            const impactColorClass = tip.impact === 'High' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
            const tipEl = document.createElement('div');
            tipEl.className = 'suggestion-card';
            tipEl.innerHTML = `
                <div class="suggestion-header">
                    <h4 style="font-size: 1.125rem; font-weight: 600;">${tip.title}</h4>
                    <span class="impact-badge ${impactColorClass}">${tip.impact} Impact</span>
                </div>
                <p style="margin-top: 0.5rem; color: var(--gray-text);">${tip.description}</p>`;
            suggestionsList.appendChild(tipEl);
        });
    }

    // --- PROFILE & ESTIMATE MANAGEMENT ---
    function openSaveEstimateModal() {
        profileModalTitle.textContent = "Save Estimate";
        profileModalBody.innerHTML = `<p>Enter a name for this estimate (e.g., "Baseline", "With New Fridge").</p><input type="text" id="estimate-name-input" class="form-input" style="margin-top: 0.5rem;" placeholder="Estimate Name">`;
        profileModalConfirm.textContent = "Save";
        profileModal.classList.add('active');
        
        profileModalConfirm.onclick = () => {
            const name = document.getElementById('estimate-name-input').value.trim();
            if(name) {
                state.currentEstimateResult.name = name;
                state.savedEstimates.push(state.currentEstimateResult);
                saveStateToStorage();
                profileModal.classList.remove('active');
                renderComparisonPage();
            }
        };
    }
    
    function renderComparisonPage() {
        const container = document.getElementById('comparison-container');
        const noItemsText = document.getElementById('no-comparison-text');
        container.innerHTML = '';

        if(state.savedEstimates.length === 0) {
            noItemsText.style.display = 'block';
            return;
        }
        noItemsText.style.display = 'none';

        state.savedEstimates.forEach((est, index) => {
            const card = document.createElement('div');
            card.className = 'space-y-2';
            card.style = 'background-color: var(--gray-light); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--gray-border);';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-weight: 700; font-size: 1.125rem;">${est.name}</h3>
                    <button data-index="${index}" class="delete-estimate" style="color: #ef4444; background: none; border: none; cursor: pointer;">X</button>
                </div>
                <p style="font-size: 0.875rem; color: var(--gray-text);">${new Date(est.date).toLocaleDateString()}</p>
                <p style="font-size: 1.5rem; font-weight: 700; color: var(--green-dark);">${est.currency}${est.totalBill.toFixed(2)}</p>
                <p style="font-size: 0.875rem; color: #4b5563;">${est.totalKwh.toFixed(0)} kWh/month</p>
            `;
            container.appendChild(card);
        });
        container.querySelectorAll('.delete-estimate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.dataset.index;
                state.savedEstimates.splice(index, 1);
                saveStateToStorage();
                renderComparisonPage();
            });
        });
    }
    
    function openSaveProfileModal() {
         profileModalTitle.textContent = "Save Profile";
         profileModalBody.innerHTML = `<p>Enter a name for your current household profile.</p><input type="text" id="profile-name-input" class="form-input" style="margin-top: 0.5rem;" value="${state.currentProfileName}">`;
         profileModalConfirm.textContent = "Save";
         profileModal.classList.add('active');

         profileModalConfirm.onclick = () => {
             const name = document.getElementById('profile-name-input').value.trim();
             if (name) {
                 saveCurrentAppliances();
                 state.currentProfileName = name;
                 // Deep copy the current data to the new profile name
                 state.profiles[state.currentProfileName] = JSON.parse(JSON.stringify(state.seasonalData));
                 localStorage.setItem('wattwise_profiles', JSON.stringify(state.profiles));
                 localStorage.setItem('wattwise_currentProfile', state.currentProfileName);
                 profileModal.classList.remove('active');
             }
         };
    }

    function openLoadProfileModal() {
         profileModalTitle.textContent = "Load Profile";
         let profileListHTML = '<p style="margin-bottom: 0.5rem;">Select a profile to load:</p>';
         if(Object.keys(state.profiles).length > 0) {
            profileListHTML += `<div class="space-y-2">`;
            for (const name in state.profiles) {
                profileListHTML += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid var(--gray-border); border-radius: 0.5rem;"><label style="display: flex; align-items: center; gap: 0.5rem;"><input type="radio" name="profile" value="${name}" ${name === state.currentProfileName ? 'checked' : ''}>${name}</label><button data-name="${name}" class="delete-profile" style="color: #ef4444; font-size: 0.875rem; background: none; border: none; cursor: pointer;">Delete</button></div>`;
            }
             profileListHTML += `</div>`;
         } else {
            profileListHTML = '<p>No saved profiles found.</p>';
         }
         profileModalBody.innerHTML = profileListHTML;
         profileModalConfirm.textContent = "Load";
         profileModal.classList.add('active');

         profileModalBody.querySelectorAll('.delete-profile').forEach(button => {
            button.addEventListener('click', (e) => {
                const nameToDelete = e.target.dataset.name;
                if(nameToDelete && nameToDelete !== 'Default') {
                    delete state.profiles[nameToDelete];
                    if (state.currentProfileName === nameToDelete) {
                        state.currentProfileName = 'Default';
                        localStorage.setItem('wattwise_currentProfile', 'Default');
                        loadStateFromStorage();
                        renderApplianceList();
                    }
                    localStorage.setItem('wattwise_profiles', JSON.stringify(state.profiles));
                    openLoadProfileModal(); // Re-render modal
                }
            });
         });

         profileModalConfirm.onclick = () => {
             const selected = profileModalBody.querySelector('input[name="profile"]:checked');
             if (selected && state.currentProfileName !== selected.value) {
                saveCurrentAppliances();
                state.profiles[state.currentProfileName] = JSON.parse(JSON.stringify(state.seasonalData));
                
                state.currentProfileName = selected.value;
                localStorage.setItem('wattwise_currentProfile', state.currentProfileName);
                loadStateFromStorage();
                renderApplianceList();
             }
             profileModal.classList.remove('active');
         };
    }
    
    function downloadPDF() {
        const { jsPDF } = window.jspdf;
        const content = document.getElementById('results-content');
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        pdf.setFontSize(22);
        pdf.text("WattWise Energy Estimate", pdf.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

        html2canvas(content, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const imgProps = pdf.getImageProperties(imgData);
            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(imgData, 'PNG', 10, 25, pdfWidth, imgHeight);
            pdf.save('WattWise-Estimate.pdf');
        });
    }
    
    initialize();
});