// Hero Banner Slider
const heroSlides = document.querySelectorAll('.hero-slide');
let currentHeroSlide = 0;

function showHeroSlide(index) {
    heroSlides.forEach((slide, i) => {
        slide.classList.remove('active');
    });

    if (heroSlides[index]) {
        heroSlides[index].classList.add('active');
    }
}

function nextHeroSlide() {
    currentHeroSlide = (currentHeroSlide + 1) % heroSlides.length;
    showHeroSlide(currentHeroSlide);
}

// Start hero slider auto-rotation every 5 seconds
if (heroSlides.length > 0) {
    setInterval(nextHeroSlide, 5000);
}

// Mobile Menu Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

// Dropdown Toggle (works on both mobile and desktop)
const dropdowns = document.querySelectorAll('.dropdown > a');

dropdowns.forEach(dropdownLink => {
    dropdownLink.addEventListener('click', function (e) {
        e.preventDefault();
        const dropdown = this.parentElement;
        const isActive = dropdown.classList.contains('active');

        // Close all other dropdowns
        document.querySelectorAll('.dropdown').forEach(d => {
            if (d !== dropdown) {
                d.classList.remove('active');
            }
        });

        // Toggle current dropdown
        dropdown.classList.toggle('active', !isActive);
    });
});

// Close dropdowns when clicking outside
document.addEventListener('click', function (e) {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown').forEach(dropdown => {
            dropdown.classList.remove('active');
        });
    }
});

// Close mobile menu when clicking on a link (but not dropdown parent links)
document.querySelectorAll('.nav-menu > li > a').forEach(link => {
    // Skip dropdown parent links (they're handled separately)
    if (!link.parentElement.classList.contains('dropdown')) {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
        });
    }
});

// Close dropdowns when clicking on dropdown menu links
document.querySelectorAll('.dropdown-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Feedback Slider
const slides = document.querySelectorAll('.feedback-slide');
const prevBtn = document.querySelector('.prev-btn');
const nextBtn = document.querySelector('.next-btn');
let currentSlide = 0;
let slideInterval;

// Create dots
const sliderDots = document.querySelector('.slider-dots');
if (sliderDots && slides.length > 0) {
    slides.forEach((_, index) => {
        const dot = document.createElement('span');
        dot.classList.add('slider-dot');
        if (index === 0) dot.classList.add('active');
        dot.addEventListener('click', () => goToSlide(index));
        sliderDots.appendChild(dot);
    });
}

function showSlide(index) {
    slides.forEach((slide, i) => {
        slide.classList.remove('active');
        const dots = document.querySelectorAll('.slider-dot');
        if (dots[i]) {
            dots[i].classList.remove('active');
        }
    });

    if (slides[index]) {
        slides[index].classList.add('active');
        const dots = document.querySelectorAll('.slider-dot');
        if (dots[index]) {
            dots[index].classList.add('active');
        }
    }
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    showSlide(currentSlide);
}

function goToSlide(index) {
    currentSlide = index;
    showSlide(currentSlide);
    resetAutoSlide();
}

function startAutoSlide() {
    slideInterval = setInterval(nextSlide, 5000); // Change slide every 5 seconds
}

function resetAutoSlide() {
    clearInterval(slideInterval);
    startAutoSlide();
}

if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        nextSlide();
        resetAutoSlide();
    });
}

if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        prevSlide();
        resetAutoSlide();
    });
}

// Start auto-slide if slider exists
if (slides.length > 0) {
    startAutoSlide();

    // Pause on hover
    const slider = document.querySelector('.feedback-slider');
    if (slider) {
        slider.addEventListener('mouseenter', () => {
            clearInterval(slideInterval);
        });

        slider.addEventListener('mouseleave', () => {
            startAutoSlide();
        });
    }
}

// Form Validation
const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const name = document.getElementById('name');
        const email = document.getElementById('email');
        const message = document.getElementById('message');

        let isValid = true;

        // Clear previous errors
        document.querySelectorAll('.error-message').forEach(error => {
            error.textContent = '';
        });

        // Validate Name
        if (name.value.trim() === '') {
            showError(name, 'Adyňyzy giriziň');
            isValid = false;
        } else if (name.value.trim().length < 2) {
            showError(name, 'Name must be at least 2 characters');
            isValid = false;
        }

        // Validate Email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email.value.trim() === '') {
            showError(email, 'Please enter your email address');
            isValid = false;
        } else if (!emailRegex.test(email.value)) {
            showError(email, 'Please enter a valid email address');
            isValid = false;
        }

        // Validate Message
        if (message.value.trim() === '') {
            showError(message, 'Please write a message');
            isValid = false;
        } else if (message.value.trim().length < 10) {
            showError(message, 'Message must be at least 10 characters');
            isValid = false;
        }

        if (isValid) {
            // Show success message
            alert('Thank you! Your message has been sent. We will contact you soon.');
            contactForm.reset();
        }
    });
}

function showError(input, message) {
    const errorElement = input.parentElement.querySelector('.error-message');
    if (errorElement) {
        errorElement.textContent = message;
    }
}

// Header scroll effect
let lastScroll = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        header.style.boxShadow = '0 2px 20px rgba(0,0,0,0.15)';
    } else {
        header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    }

    lastScroll = currentScroll;
});

// Gallery zoom effect on click (optional enhancement)
const galleryItems = document.querySelectorAll('.gallery-item');
galleryItems.forEach(item => {
    item.addEventListener('click', function () {
        const img = this.querySelector('img');
        if (img) {
            // Create modal for full-size image view
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                cursor: pointer;
            `;

            const modalImg = document.createElement('img');
            modalImg.src = img.src;
            modalImg.style.cssText = `
                max-width: 90%;
                max-height: 90%;
                object-fit: contain;
            `;

            modal.appendChild(modalImg);
            document.body.appendChild(modal);

            modal.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        }
    });
});

function playVideo(element) {
    const video = element.querySelector('video');
    const poster = element.querySelector('.poster');
    const playButton = element.querySelector('.play-button');

    // Wideonyň ýoly barada
    if (!video.src) {
        video.src = video.dataset.src; // data-src-dan alyp goýýar
    }

    // Görnüşi üýtgedýär
    poster.style.display = 'none';
    playButton.style.display = 'none';
    video.style.display = 'block';

    // Pause other videos first
    document.querySelectorAll('.video-item').forEach(item => {
        const v = item.querySelector('video');
        const p = item.querySelector('.poster');
        const btn = item.querySelector('.play-button');
            if (v && v !== video) {
            v.pause();
            v.currentTime = 0;
            v.style.display = 'none';
            if (p) p.style.display = '';
            if (btn) btn.style.display = '';
        }
    });

    // Oýnadyp başlaýar
    video.play();
}

// Ensure native video controls (or programmatic play) also pause other videos
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('video').forEach(v => {
        v.addEventListener('play', function () {
            document.querySelectorAll('video').forEach(other => {
                if (other !== v) {
                    other.pause();
                    other.currentTime = 0;
                    const parent = other.closest('.video-item');
                    if (parent) {
                        const p = parent.querySelector('.poster');
                        const btn = parent.querySelector('.play-button');
                        other.style.display = 'none';
                        if (p) p.style.display = '';
                        if (btn) btn.style.display = '';
                    }
                }
            });
        });

        v.addEventListener('ended', function () {
            const parent = v.closest('.video-item');
                if (parent) {
                const p = parent.querySelector('.poster');
                const btn = parent.querySelector('.play-button');
                v.style.display = 'none';
                if (p) p.style.display = '';
                if (btn) btn.style.display = '';
            }
            v.currentTime = 0;
        });
    });
});