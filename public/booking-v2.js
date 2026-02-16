// State
const state = {
    currentStep: 1,
    selectedLocation: null,
    selectedVehicleType: null,
    selectedCategory: 'outside',
    startDate: '',
    endDate: '',
    discountCode: '',
    pricing: {
        monthlyPriceNet: 0,
        vatAmount: 0,
        monthlyPrice: 0,
        proRataAmount: 0,
        discountAmount: 0,
        depositAmount: 0,
        totalAmount: 0
    },
    signature: {
        paths: [],
        currentPath: []
    }
};

// Canvas setup
let canvas, ctx;
let isDrawing = false;

// Track if location was pre-selected via deeplink
let locationLocked = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    const locationParam = urlParams.get('location');

    if (inviteToken) {
        await loadInviteData(inviteToken);
    }

    if (locationParam) {
        state.selectedLocation = parseInt(locationParam);
        locationLocked = true;
    }

    await loadLocations();
    await loadVehicleTypes();
    initializeSignatureCanvas();
    attachEventListeners();

    // Set minimum end date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('endDate').min = today;
});

// Load invite data
async function loadInviteData(token) {
    try {
        const response = await fetch(`/api/invite/${token}`);
        if (response.ok) {
            const data = await response.json();

            if (data.location_id) {
                state.selectedLocation = data.location_id;
            }
            if (data.vehicle_type_id) {
                state.selectedVehicleType = data.vehicle_type_id;
            }
            if (data.category) {
                state.selectedCategory = data.category;
            }
            if (data.prefill_email) {
                document.getElementById('email').value = data.prefill_email;
            }
        }
    } catch (error) {
        console.error('Error loading invite:', error);
    }
}

// Load locations
async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        const locations = await response.json();

        const select = document.getElementById('location');
        locations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc.id;
            option.textContent = loc.name;
            option.dataset.address = loc.address;
            option.dataset.category = loc.category;
            select.appendChild(option);
        });

        // Pre-select if from invite or location deeplink
        if (state.selectedLocation) {
            select.value = state.selectedLocation;
            select.dispatchEvent(new Event('change'));

            if (locationLocked) {
                select.disabled = true;
                select.style.opacity = '0.7';
            }
        }
    } catch (error) {
        console.error('Error loading locations:', error);
    }
}

// Load vehicle types
async function loadVehicleTypes() {
    try {
        const response = await fetch('/api/pricing/1');
        const vehicleTypes = await response.json();

        // Get unique vehicle types
        const unique = [...new Map(vehicleTypes.map(item => [item.vehicle_type_id, item])).values()];

        const select = document.getElementById('vehicleType');
        unique.forEach(vt => {
            const option = document.createElement('option');
            option.value = vt.vehicle_type_id;
            option.textContent = vt.vehicle_label;
            select.appendChild(option);
        });

        // Pre-select if from invite
        if (state.selectedVehicleType) {
            select.value = state.selectedVehicleType;
            select.dispatchEvent(new Event('change'));
        }
    } catch (error) {
        console.error('Error loading vehicle types:', error);
    }
}

// Event listeners
function attachEventListeners() {
    // Location change
    document.getElementById('location').addEventListener('change', (e) => {
        state.selectedLocation = e.target.value;
        const selectedOption = e.target.options[e.target.selectedIndex];
        document.getElementById('location-address').textContent = selectedOption.dataset.address || '';

        // Lock category based on location's assigned category
        const locationCategory = selectedOption.dataset.category;
        if (locationCategory) {
            state.selectedCategory = locationCategory;

            // Update segmented control buttons
            document.querySelectorAll('.segmented-control button').forEach(btn => {
                const btnCategory = btn.dataset.category;
                if (btnCategory === locationCategory) {
                    btn.classList.add('active');
                    btn.disabled = false;
                } else {
                    btn.classList.remove('active');
                    btn.disabled = true;
                    btn.style.opacity = '0.3';
                }
            });
        }

        updatePricing();
    });

    // Vehicle type change
    document.getElementById('vehicleType').addEventListener('change', (e) => {
        state.selectedVehicleType = e.target.value;
        updatePricing();
    });

    // Category buttons
    document.querySelectorAll('.segmented-control button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Don't allow manual change if button is disabled (location has fixed category)
            if (e.target.disabled) {
                return;
            }

            document.querySelectorAll('.segmented-control button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.selectedCategory = e.target.dataset.category;
            updatePricing();
        });
    });

    // Pre-select category if from invite
    if (state.selectedCategory) {
        document.querySelector(`[data-category="${state.selectedCategory}"]`)?.click();
    }

    // Date changes
    document.getElementById('startDate').addEventListener('change', (e) => {
        state.startDate = e.target.value;
        // Update end date minimum
        document.getElementById('endDate').min = e.target.value;
        updatePricing();
    });

    document.getElementById('endDate').addEventListener('change', (e) => {
        state.endDate = e.target.value;
        updatePricing();
    });

    // Discount code
    document.getElementById('applyDiscount').addEventListener('click', applyDiscount);

    // Navigation
    document.getElementById('nextStep1').addEventListener('click', () => goToStep(2));
    document.getElementById('prevStep2').addEventListener('click', () => goToStep(1));
    document.getElementById('nextStep2').addEventListener('click', validateAndGoToStep3);
    document.getElementById('prevStep3').addEventListener('click', () => goToStep(2));
    document.getElementById('nextStep3').addEventListener('click', () => goToStep(4));
    document.getElementById('prevStep4').addEventListener('click', () => goToStep(3));

    // Signature
    document.getElementById('clearSignature').addEventListener('click', clearSignature);
    document.getElementById('undoSignature').addEventListener('click', undoSignature);

    // Submit
    document.getElementById('submitBooking').addEventListener('click', submitBooking);
}

// Update pricing
async function updatePricing() {
    if (!state.selectedLocation || !state.selectedVehicleType || !state.selectedCategory) {
        return;
    }

    try {
        const response = await fetch(`/api/pricing/${state.selectedLocation}`);
        const pricingData = await response.json();

        const priceInfo = pricingData.find(p =>
            p.vehicle_type_id == state.selectedVehicleType &&
            p.category === state.selectedCategory
        );

        if (priceInfo) {
            const netPrice = priceInfo.price;
            const vat = netPrice * 0.19;
            const grossPrice = netPrice + vat;

            state.pricing.monthlyPriceNet = netPrice;
            state.pricing.vatAmount = vat;
            state.pricing.monthlyPrice = grossPrice;
            state.pricing.depositAmount = grossPrice * 1;

            // Calculate pro-rata if start date is set
            if (state.startDate) {
                const start = new Date(state.startDate);
                const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
                const startDay = start.getDate();

                if (startDay > 1) {
                    const remainingDays = daysInMonth - startDay + 1;
                    const dailyRate = grossPrice / daysInMonth;
                    state.pricing.proRataAmount = dailyRate * remainingDays;
                } else {
                    state.pricing.proRataAmount = 0;
                }
            }

            calculateTotal();
            updatePricingDisplay();
        }
    } catch (error) {
        console.error('Error updating pricing:', error);
    }
}

// Apply discount
async function applyDiscount() {
    const code = document.getElementById('discountCode').value.trim();
    if (!code) return;

    state.discountCode = code.toUpperCase();

    // Discount calculation happens on backend
    calculateTotal();
    updatePricingDisplay();

    document.getElementById('discount-status').innerHTML = `
        <div class="discount-applied">
            ✓ Rabattcode wird bei Buchung geprüft
        </div>
    `;
}

// Calculate total
function calculateTotal() {
    const firstPayment = state.pricing.proRataAmount || state.pricing.monthlyPrice;
    state.pricing.totalAmount = firstPayment - state.pricing.discountAmount + state.pricing.depositAmount;
}

// Update pricing display
function updatePricingDisplay() {
    document.getElementById('monthlyPriceNet').textContent = `€ ${state.pricing.monthlyPriceNet.toFixed(2)}`;
    document.getElementById('vatAmount').textContent = `€ ${state.pricing.vatAmount.toFixed(2)}`;
    document.getElementById('monthlyPrice').textContent = `€ ${state.pricing.monthlyPrice.toFixed(2)}`;
    document.getElementById('depositAmount').textContent = `€ ${state.pricing.depositAmount.toFixed(2)}`;
    document.getElementById('totalAmount').textContent = `€ ${state.pricing.totalAmount.toFixed(2)}`;

    if (state.pricing.proRataAmount > 0) {
        document.getElementById('proRataRow').style.display = 'flex';
        document.getElementById('proRataPrice').textContent = `€ ${state.pricing.proRataAmount.toFixed(2)}`;
    } else {
        document.getElementById('proRataRow').style.display = 'none';
    }

    if (state.pricing.discountAmount > 0) {
        document.getElementById('discountRow').style.display = 'flex';
        document.getElementById('discountAmount').textContent = `-€ ${state.pricing.discountAmount.toFixed(2)}`;
    } else {
        document.getElementById('discountRow').style.display = 'none';
    }
}

// Navigate to step
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));

    // Show target step
    document.getElementById(`step${step}`).classList.remove('hidden');

    // Update step indicators
    document.querySelectorAll('.step').forEach((stepEl, index) => {
        stepEl.classList.remove('active', 'completed');
        if (index + 1 < step) {
            stepEl.classList.add('completed');
        } else if (index + 1 === step) {
            stepEl.classList.add('active');
        }
    });

    state.currentStep = step;

    // Load contract preview if step 3
    if (step === 3) {
        loadContractPreview();
    }

    // Re-initialize signature canvas if step 4
    if (step === 4) {
        // Small delay to ensure canvas is rendered
        setTimeout(() => {
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = 200;
                ctx.strokeStyle = '#1d1d1f';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }, 100);
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Validate and go to step 3
function validateAndGoToStep3() {
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const address = document.getElementById('address').value.trim();
    const email = document.getElementById('email').value.trim();
    const agbAccept = document.getElementById('agbAccept').checked;

    if (!firstName || !lastName || !address || !email || !agbAccept) {
        alert('Bitte füllen Sie alle Pflichtfelder aus und akzeptieren Sie die AGB.');
        return;
    }

    goToStep(3);
}

// Load contract preview
async function loadContractPreview() {
    const previewEl = document.getElementById('contractPreview');
    previewEl.innerHTML = '<p style="text-align: center; color: #6e6e73;">Lädt Vorschau...</p>';

    // For preview, we'll show a simplified version
    // In production, you'd create a temporary booking or use a preview endpoint

    const categoryLabels = {
        'outside': 'Außenstellplatz',
        'covered': 'Überdacht',
        'indoor': 'Halle'
    };

    const locationName = document.querySelector('#location option:checked').textContent;
    const vehicleLabel = document.querySelector('#vehicleType option:checked').textContent;

    const html = `
        <h1>Stellplatzmietvertrag (temporär)</h1>

        <h2>Vertragsparteien</h2>
        <p><strong>Mieter:</strong> ${document.getElementById('firstName').value} ${document.getElementById('lastName').value}<br>
        ${document.getElementById('address').value}<br>
        E-Mail: ${document.getElementById('email').value}</p>

        <h2>§1 Mietgegenstand</h2>
        <p>(1) Vermietet wird ein Stellplatz am Standort ${locationName}, ${categoryLabels[state.selectedCategory]}.</p>
        <p>(2) Der Stellplatz dient zum Abstellen des Fahrzeugs: ${vehicleLabel}.</p>

        <h2>§2 Mietzeit</h2>
        <p>(1) Mietbeginn: ${new Date(state.startDate).toLocaleDateString('de-DE')}, Mietende: ${new Date(state.endDate).toLocaleDateString('de-DE')}</p>

        <h2>§3 Miete / Kaution</h2>
        <p>(1) Monatsmiete: € ${state.pricing.monthlyPrice.toFixed(2)} (Brutto)</p>
        ${state.pricing.proRataAmount > 0 ? `<p>(2) Anteilige Miete (erster Monat): € ${state.pricing.proRataAmount.toFixed(2)}</p>` : ''}
        ${state.discountCode ? `<p>Rabatt: Code "${state.discountCode}"</p>` : ''}
        <p>Kaution: € ${state.pricing.depositAmount.toFixed(2)}</p>

        <p style="margin-top: 30px; color: #6e6e73; font-size: 12px;">
            Dies ist eine Vorschau. Der vollständige Vertrag wird nach Ihrer Unterschrift erstellt.
        </p>
    `;

    previewEl.innerHTML = html;
}

// Initialize signature canvas
function initializeSignatureCanvas() {
    canvas = document.getElementById('signatureCanvas');
    ctx = canvas.getContext('2d');

    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 200;

    ctx.strokeStyle = '#1d1d1f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events - Direct handling instead of dispatching mouse events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    isDrawing = true;
    canvas.classList.add('active');
    state.signature.currentPath = [];
    state.signature.currentPath.push({ x, y, type: 'M' });
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function handleTouchMove(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    state.signature.currentPath.push({ x, y, type: 'L' });
    ctx.lineTo(x, y);
    ctx.stroke();
}

function handleTouchEnd(e) {
    if (!isDrawing) return;
    e.preventDefault();

    isDrawing = false;
    canvas.classList.remove('active');

    if (state.signature.currentPath.length > 0) {
        state.signature.paths.push([...state.signature.currentPath]);
    }
    state.signature.currentPath = [];
}

function startDrawing(e) {
    isDrawing = true;
    canvas.classList.add('active');
    state.signature.currentPath = [];

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    state.signature.currentPath.push({ x, y, type: 'M' });
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function draw(e) {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    state.signature.currentPath.push({ x, y, type: 'L' });
    ctx.lineTo(x, y);
    ctx.stroke();
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    canvas.classList.remove('active');

    if (state.signature.currentPath.length > 0) {
        state.signature.paths.push([...state.signature.currentPath]);
    }
    state.signature.currentPath = [];
}

function clearSignature() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.signature.paths = [];
    state.signature.currentPath = [];
}

function undoSignature() {
    if (state.signature.paths.length === 0) return;

    state.signature.paths.pop();
    redrawSignature();
}

function redrawSignature() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    state.signature.paths.forEach(path => {
        ctx.beginPath();
        path.forEach(point => {
            if (point.type === 'M') {
                ctx.moveTo(point.x, point.y);
            } else if (point.type === 'L') {
                ctx.lineTo(point.x, point.y);
            }
        });
        ctx.stroke();
    });
}

function getSignatureSVG() {
    const paths = state.signature.paths.map(path => {
        const d = path.map((point, i) => {
            return `${point.type} ${point.x} ${point.y}`;
        }).join(' ');
        return `<path d="${d}" stroke="#1d1d1f" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">${paths}</svg>`;
}

// Submit booking
async function submitBooking() {
    if (state.signature.paths.length === 0) {
        alert('Bitte fügen Sie Ihre Unterschrift hinzu.');
        return;
    }

    const submitBtn = document.getElementById('submitBooking');
    submitBtn.disabled = true;
    document.getElementById('submitText').style.display = 'none';
    document.getElementById('submitLoading').style.display = 'inline-block';

    try {
        const signatureImage = canvas.toDataURL('image/png');
        const signatureSVG = getSignatureSVG();

        const bookingData = {
            locationId: parseInt(state.selectedLocation),
            vehicleTypeId: parseInt(state.selectedVehicleType),
            category: state.selectedCategory,
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            address: document.getElementById('address').value.trim(),
            email: document.getElementById('email').value.trim(),
            startDate: state.startDate,
            endDate: state.endDate,
            customerSignatureImage: signatureImage,
            customerSignatureSVG: signatureSVG,
            discountCode: state.discountCode || null,
            depositMultiplier: 1,
            billingCycle: 'monthly',
            noticePeriodDays: 30
        };

        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bookingData)
        });

        const result = await response.json();

        if (result.success) {
            document.getElementById('bookingId').textContent = result.bookingId;
            document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));
            document.getElementById('successStep').classList.remove('hidden');
            document.querySelector('.steps').style.display = 'none';
        } else {
            let errorMsg = result.error || 'Unbekannter Fehler';
            if (result.details && result.details.length > 0) {
                errorMsg += '\n' + result.details.map(d => `${d.field}: ${d.message}`).join('\n');
            }
            alert('Fehler: ' + errorMsg);
            submitBtn.disabled = false;
            document.getElementById('submitText').style.display = 'inline';
            document.getElementById('submitLoading').style.display = 'none';
        }
    } catch (error) {
        console.error('Error submitting booking:', error);
        alert('Fehler bei der Übermittlung. Bitte versuchen Sie es erneut.');
        submitBtn.disabled = false;
        document.getElementById('submitText').style.display = 'inline';
        document.getElementById('submitLoading').style.display = 'none';
    }
}
