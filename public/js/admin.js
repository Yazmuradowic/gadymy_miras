// Admin panel üçin umumy skriptler (galereýa / wideolar)

// 1) data-confirm="..." bolan formalar ugradylmazdan öň tassyklama soraýar
document.addEventListener('submit', function (e) {
    var form = e.target;
    var msg = form && form.getAttribute && form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}, true);

// 2) Köpçülikleýin saýlamak we pozmak.
//    <form class="js-bulk-form" id="X"> + kartoçkalardaky <input class="js-select-item" form="X">
(function () {
    var forms = document.querySelectorAll('form.js-bulk-form');
    Array.prototype.forEach.call(forms, function (form) {
        var items = Array.prototype.slice.call(
            document.querySelectorAll('input.js-select-item[form="' + form.id + '"]')
        );
        var selectAll = form.querySelector('.js-select-all');
        var submitBtn = form.querySelector('.js-bulk-submit');
        var countEl = form.querySelector('.js-bulk-count');

        function update() {
            var checked = items.filter(function (cb) { return cb.checked; }).length;
            if (countEl) countEl.textContent = checked;
            if (submitBtn) submitBtn.disabled = checked === 0;
            if (selectAll) {
                selectAll.checked = checked > 0 && checked === items.length;
                selectAll.indeterminate = checked > 0 && checked < items.length;
            }
            items.forEach(function (cb) {
                var card = cb.closest('.js-selectable');
                if (card) card.classList.toggle('is-selected', cb.checked);
            });
        }

        if (selectAll) {
            selectAll.addEventListener('change', function () {
                items.forEach(function (cb) { cb.checked = selectAll.checked; });
                update();
            });
        }
        items.forEach(function (cb) { cb.addEventListener('change', update); });

        // Sahypa yzyna gaýdyp gelnende brauzer belgileri ýatda saklap biler – ýagdaýy deňleşdirýäris
        window.addEventListener('pageshow', update);
        update();
    });
})();

// 3) Galereýa: birnäçe suraty birbada ýüklemek (öňünden barlag, kiçi suratlar, progress)
(function () {
    var form = document.getElementById('galleryUploadForm');
    if (!form || !window.FormData || !window.XMLHttpRequest) return;

    var fileInput = form.querySelector('input[type="file"][name="image_files"]');
    var urlInput = form.querySelector('input[name="image_url"]');
    var preview = document.getElementById('galleryUploadPreview');
    var submitBtn = document.getElementById('galleryUploadSubmit');
    var progress = document.getElementById('galleryUploadProgress');
    var labelEl = progress.querySelector('.upload-progress__label');
    var percentEl = progress.querySelector('.upload-progress__percent');
    var barEl = progress.querySelector('.upload-progress__bar-fill');
    var errorEl = document.getElementById('galleryUploadError');

    var maxFiles = parseInt(form.getAttribute('data-max-files'), 10) || 30;
    var maxFileMb = parseInt(form.getAttribute('data-max-file-mb'), 10) || 10;
    var maxBytes = maxFileMb * 1024 * 1024;
    var originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Goş';
    var previewUrls = [];

    function selectedFiles() {
        return fileInput ? Array.prototype.slice.call(fileInput.files || []) : [];
    }

    function mb(bytes) {
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function setProgress(pct) {
        var v = Math.max(0, Math.min(100, Math.round(pct || 0)));
        percentEl.textContent = v + '%';
        barEl.style.width = v + '%';
    }

    function showError(msg) {
        progress.hidden = true;
        errorEl.textContent = msg;
        errorEl.hidden = false;
    }

    function clearError() {
        errorEl.textContent = '';
        errorEl.hidden = true;
    }

    // Saýlanan faýllardaky meseleler (sany, ölçegi) – ýüklemezden öň
    function validate(files) {
        if (!files.length && !(urlInput && urlInput.value.trim())) {
            return 'Iň bolmanda bir surat faýly saýlamaly ýa-da URL girizmeli.';
        }
        if (files.length > maxFiles) {
            return 'Bir gezekde iň köp ' + maxFiles + ' surat ýükläp bolýar. Siz ' + files.length + ' surat saýladyňyz.';
        }
        var tooBig = files.filter(function (f) { return f.size > maxBytes; });
        if (tooBig.length) {
            return 'Bu faýllar ' + maxFileMb + ' MB-dan uly: ' +
                tooBig.map(function (f) { return f.name + ' (' + mb(f.size) + ')'; }).join(', ');
        }
        var notImages = files.filter(function (f) { return f.type && f.type.indexOf('image/') !== 0; });
        if (notImages.length) {
            return 'Bu faýllar surat däl: ' + notImages.map(function (f) { return f.name; }).join(', ');
        }
        return null;
    }

    function renderPreview() {
        previewUrls.forEach(function (u) { URL.revokeObjectURL(u); });
        previewUrls = [];
        preview.innerHTML = '';
        clearError();

        var files = selectedFiles();
        if (!files.length) {
            preview.hidden = true;
            return;
        }

        var total = files.reduce(function (s, f) { return s + f.size; }, 0);
        var summary = document.createElement('div');
        summary.className = 'upload-preview__summary';
        summary.textContent = files.length + ' surat saýlandy (' + mb(total) + ')';
        preview.appendChild(summary);

        files.slice(0, maxFiles).forEach(function (f) {
            var img = document.createElement('img');
            var url = URL.createObjectURL(f);
            previewUrls.push(url);
            img.src = url;
            img.alt = f.name;
            img.title = f.name + ' – ' + mb(f.size);
            if (f.size > maxBytes) img.className = 'is-invalid';
            preview.appendChild(img);
        });
        preview.hidden = false;

        var problem = validate(files);
        if (problem) showError(problem);
    }

    if (fileInput) fileInput.addEventListener('change', renderPreview);

    function resetButton() {
        if (!submitBtn) return;
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearError();

        var files = selectedFiles();
        var problem = validate(files);
        if (problem) {
            showError(problem);
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loader"></span>Ýüklenýär...';
        }
        progress.hidden = false;
        labelEl.textContent = files.length ? files.length + ' surat ýüklenýär...' : 'Goşulýar...';
        setProgress(0);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', form.action, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Accept', 'application/json');

        xhr.upload.onprogress = function (evt) {
            if (evt && evt.lengthComputable) setProgress((evt.loaded / evt.total) * 100);
        };
        // Faýllar serwere ýetdi – indi serwer olary WebP-e öwürýär
        xhr.upload.onload = function () {
            setProgress(100);
            labelEl.textContent = 'Suratlar serwerde işlenýär...';
        };

        xhr.onerror = function () {
            showError('Baglanyşyk ýalňyşlygy. Täzeden synanyşyň.');
            resetButton();
        };

        xhr.onload = function () {
            var data = null;
            try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) { data = null; }

            if (xhr.status >= 200 && xhr.status < 300 && data && data.ok) {
                window.location.href = data.redirect || form.action;
                return;
            }
            if (xhr.status === 401) {
                window.location.href = '/gadymymiras/login';
                return;
            }
            showError((data && data.error) ? data.error : 'Suratlar ýüklenmedi (serwer jogaby: ' + xhr.status + ').');
            resetButton();
        };

        xhr.send(new FormData(form));
    });
})();
