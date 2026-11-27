// Hotel Booking modal: "Services → Hotel Booking → Book now"
(function () {
    'use strict';

    // Haýyşlar şu WhatsApp belgisine gelýär (diňe sanlar, + belgisiz)
    var WHATSAPP_NUMBER = '99365667050';

    // Şäherler we otellar — täze otel goşmak üçin şu ýere ýazyň
    var CITIES = [
        {
            name: 'Ashgabat',
            hotels: [
                { name: 'Yyldyz Hotel', stars: 5, note: 'City centre, panoramic views' },
                { name: 'Sofitel Ashgabat Oguzkent', stars: 5, note: 'Business & leisure' },
                { name: 'Grand Turkmen', stars: 4, note: 'Central location' },
                { name: 'Ak Altyn', stars: 4, note: 'Near the main avenue' }
            ]
        },
        {
            name: 'Awaza',
            hotels: [
                { name: 'Hazar Hotel', stars: 5, note: 'Seafront resort on the Caspian' },
                { name: 'Yelken Hotel', stars: 5, note: 'Beachfront, yacht club' },
                { name: 'Kuwwat Hotel', stars: 4, note: 'Resort zone, private beach' }
            ]
        },
        {
            name: 'Mary',
            hotels: [
                { name: 'Margiana Hotel', stars: 4, note: 'City centre, near Merv' },
                { name: 'Mary Hotel', stars: 4, note: 'Comfortable city hotel' },
                { name: 'Sanjar Hotel', stars: 3, note: 'Good value' }
            ]
        },
        {
            name: 'Türkmenabat',
            hotels: [
                { name: 'Lebap Hotel', stars: 4, note: 'City centre' },
                { name: 'Jeyhun Hotel', stars: 3, note: 'Near the Amu Darya' }
            ]
        }
    ];

    var HELP_OPTION = { name: 'Help me choose', note: 'Our manager will suggest options', help: true };

    var overlay = document.getElementById('hotelBookingOverlay');
    if (!overlay) return;

    var form = document.getElementById('hotelBookingForm');
    var citiesBox = document.getElementById('hbCities');
    var hotelsBox = document.getElementById('hbHotels');
    var checkin = document.getElementById('hbCheckin');
    var checkout = document.getElementById('hbCheckout');
    var nightsEl = document.getElementById('hbNights');
    var lastFocus = null;

    // ---------- Şäherler we otellar ----------
    function renderCities() {
        CITIES.forEach(function (city, i) {
            var label = document.createElement('label');
            label.className = 'hb-chip';
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'city';
            input.value = city.name;
            input.checked = i === 0;
            input.addEventListener('change', function () { renderHotels(city); });
            var span = document.createElement('span');
            span.textContent = city.name;
            label.appendChild(input);
            label.appendChild(span);
            citiesBox.appendChild(label);
        });
        renderHotels(CITIES[0]);
    }

    function renderHotels(city) {
        hotelsBox.textContent = '';
        city.hotels.concat([HELP_OPTION]).forEach(function (hotel, i) {
            var label = document.createElement('label');
            label.className = 'hb-hotel' + (hotel.help ? ' hb-hotel--help' : '');

            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'hotel';
            input.value = hotel.name;
            input.checked = i === 0;
            if (hotel.stars) input.dataset.stars = hotel.stars;

            var icon = document.createElement('span');
            icon.className = 'hb-hotel-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = hotel.help ? '💬' : '🏨';

            var body = document.createElement('span');
            body.className = 'hb-hotel-body';

            var name = document.createElement('span');
            name.className = 'hb-hotel-name';
            name.textContent = hotel.name;
            body.appendChild(name);

            if (hotel.stars) {
                var stars = document.createElement('span');
                stars.className = 'hb-hotel-stars';
                stars.textContent = '★'.repeat(hotel.stars);
                stars.setAttribute('aria-label', hotel.stars + ' stars');
                body.appendChild(stars);
            }

            var note = document.createElement('span');
            note.className = 'hb-hotel-note';
            note.textContent = hotel.note;
            body.appendChild(note);

            label.appendChild(input);
            label.appendChild(icon);
            label.appendChild(body);
            hotelsBox.appendChild(label);
        });
    }

    // ---------- Seneler ----------
    function toISO(d) {
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function parseISO(s) {
        if (!s) return null;
        var p = s.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]);
    }

    function formatDate(s) {
        var p = s.split('-');
        return p[2] + '.' + p[1] + '.' + p[0];
    }

    function nightsBetween() {
        var a = parseISO(checkin.value);
        var b = parseISO(checkout.value);
        if (!a || !b) return 0;
        return Math.round((b - a) / 86400000);
    }

    function updateDates() {
        var today = new Date();
        checkin.min = toISO(today);

        var inDate = parseISO(checkin.value);
        if (inDate) {
            var next = new Date(inDate);
            next.setDate(next.getDate() + 1);
            checkout.min = toISO(next);
        } else {
            var tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            checkout.min = toISO(tomorrow);
        }

        var n = nightsBetween();
        if (checkin.value && checkout.value && n <= 0) {
            checkout.setCustomValidity('Check-out must be after check-in.');
        } else {
            checkout.setCustomValidity('');
        }

        if (n > 0) {
            nightsEl.textContent = n + (n === 1 ? ' night' : ' nights');
            nightsEl.hidden = false;
        } else {
            nightsEl.hidden = true;
        }
    }

    checkin.addEventListener('change', function () {
        // Çykyş senesi giriş senesinden öň bolsa, ony arassala
        if (checkout.value && nightsBetween() <= 0) checkout.value = '';
        updateDates();
    });
    checkout.addEventListener('change', updateDates);

    // ---------- Sanaýjylar (Adults / Children) ----------
    form.querySelectorAll('.hb-stepper').forEach(function (stepper) {
        var min = +stepper.dataset.min;
        var max = +stepper.dataset.max;
        var out = stepper.querySelector('.hb-step-value');
        var dec = stepper.querySelector('[data-step="-1"]');
        var inc = stepper.querySelector('[data-step="1"]');

        function sync() {
            var v = +out.textContent;
            dec.disabled = v <= min;
            inc.disabled = v >= max;
        }

        stepper.addEventListener('click', function (e) {
            var btn = e.target.closest('.hb-step');
            if (!btn) return;
            var v = +out.textContent + +btn.dataset.step;
            out.textContent = Math.min(max, Math.max(min, v));
            sync();
        });
        sync();
    });

    // ---------- Aç / ýap ----------
    function openModal() {
        lastFocus = document.activeElement;
        updateDates();
        overlay.hidden = false;
        // Animasiýa işlär ýaly: reflow et, soň klasy goş
        void overlay.offsetWidth;
        overlay.classList.add('is-open');
        document.body.classList.add('hb-lock');
        var first = overlay.querySelector('.hb-close');
        if (first) first.focus();
    }

    function closeModal() {
        overlay.classList.remove('is-open');
        document.body.classList.remove('hb-lock');
        setTimeout(function () { overlay.hidden = true; }, 200);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.querySelectorAll('[data-open-hotel-booking]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });
    });

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay || e.target.closest('[data-hb-close]')) closeModal();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    // ---------- Ugrat (WhatsApp) ----------
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        updateDates();
        if (!form.reportValidity()) return;

        var city = form.querySelector('input[name="city"]:checked');
        var hotel = form.querySelector('input[name="hotel"]:checked');
        var hotelText = hotel ? hotel.value : 'Help me choose';
        if (hotel && hotel.dataset.stars) hotelText += ' (' + hotel.dataset.stars + '★)';

        function val(id) { return document.getElementById(id).value.trim(); }

        var n = nightsBetween();
        var adults = document.getElementById('hbAdults').textContent;
        var children = document.getElementById('hbChildren').textContent;
        var wishes = val('hbWishes');

        var lines = [
            '*Hotel Booking Request*',
            '',
            'City: ' + (city ? city.value : ''),
            'Hotel: ' + hotelText,
            'Check-in: ' + formatDate(checkin.value),
            'Check-out: ' + formatDate(checkout.value) + ' (' + n + (n === 1 ? ' night' : ' nights') + ')',
            'Guests: ' + adults + (adults === '1' ? ' adult' : ' adults') + ', ' +
                children + (children === '1' ? ' child' : ' children'),
            'Rooms: ' + val('hbRooms') + ' × ' + val('hbRoomType'),
            '',
            'Name: ' + val('hbName'),
            'Phone: ' + val('hbPhone'),
            'Email: ' + val('hbEmail')
        ];
        if (wishes) lines.push('Wishes: ' + wishes);

        var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
        var win = window.open(url, '_blank');
        if (win) {
            win.opener = null;
        } else {
            // Popup bloklanan bolsa, şol sahypada aç
            window.location.href = url;
        }
    });

    renderCities();
})();
