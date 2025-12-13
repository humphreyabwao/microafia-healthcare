// ========================================
// Microafia Healthcare - URL Helper
// Handles clean URLs in production while maintaining .html for local development
// ========================================

(function() {
    'use strict';

    // Detect environment
    const isLocalDevelopment = (function() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // Local development indicators
        const localIndicators = [
            hostname === 'localhost',
            hostname === '127.0.0.1',
            hostname.startsWith('192.168.'),
            hostname.startsWith('10.'),
            protocol === 'file:',
            hostname.includes('.local'),
            // VS Code Live Server default
            hostname === '127.0.0.1' || hostname === 'localhost'
        ];
        
        return localIndicators.some(indicator => indicator === true);
    })();

    // Production domains
    const productionDomains = [
        'microafiahealthcare.co.ke',
        'www.microafiahealthcare.co.ke',
        'microafia.netlify.app',
        'microafia.vercel.app'
    ];

    const isProduction = productionDomains.some(domain => 
        window.location.hostname.includes(domain.replace('www.', ''))
    ) || !isLocalDevelopment;

    /**
     * Convert URL based on environment
     * In production: removes .html extension
     * In local development: keeps .html extension
     */
    function convertUrl(url) {
        if (!url || typeof url !== 'string') return url;
        
        // Don't modify external URLs, anchors only, or special protocols
        if (url.startsWith('http') || 
            url.startsWith('//') || 
            url.startsWith('#') || 
            url.startsWith('mailto:') || 
            url.startsWith('tel:') ||
            url.startsWith('javascript:')) {
            return url;
        }

        // Handle hash fragments
        let hash = '';
        let baseUrl = url;
        if (url.includes('#')) {
            const parts = url.split('#');
            baseUrl = parts[0];
            hash = '#' + parts[1];
        }

        // Handle query strings
        let query = '';
        if (baseUrl.includes('?')) {
            const parts = baseUrl.split('?');
            baseUrl = parts[0];
            query = '?' + parts[1];
        }

        if (isLocalDevelopment) {
            // LOCAL: Ensure .html extension exists
            if (baseUrl && !baseUrl.endsWith('.html') && !baseUrl.endsWith('/') && !baseUrl.includes('.')) {
                // Add .html if it's a page reference without extension
                baseUrl = baseUrl + '.html';
            }
            // Handle index references
            if (baseUrl === '/' || baseUrl === '') {
                baseUrl = 'index.html';
            }
        } else {
            // PRODUCTION: Remove .html extension for clean URLs
            if (baseUrl.endsWith('.html')) {
                baseUrl = baseUrl.slice(0, -5); // Remove .html
            }
            // Handle index.html -> /
            if (baseUrl === 'index' || baseUrl === './index') {
                baseUrl = '/';
            }
            // Ensure leading slash for absolute paths
            if (baseUrl && !baseUrl.startsWith('/') && !baseUrl.startsWith('.')) {
                baseUrl = '/' + baseUrl;
            }
        }

        return baseUrl + query + hash;
    }

    /**
     * Navigate to a URL with proper environment handling
     */
    function navigateTo(url) {
        window.location.href = convertUrl(url);
    }

    /**
     * Process all links on the page
     * Call this after DOM is loaded
     */
    function processAllLinks() {
        const links = document.querySelectorAll('a[href]');
        
        links.forEach(link => {
            const originalHref = link.getAttribute('href');
            const convertedHref = convertUrl(originalHref);
            
            if (originalHref !== convertedHref) {
                link.setAttribute('href', convertedHref);
            }
        });
    }

    /**
     * Get the correct URL for a page
     * Usage: MicroafiaURL.getUrl('book-appointment') or MicroafiaURL.getUrl('book-appointment.html')
     */
    function getUrl(page) {
        // Normalize input - remove .html if present
        let normalizedPage = page;
        if (page.endsWith('.html')) {
            normalizedPage = page.slice(0, -5);
        }
        
        if (isLocalDevelopment) {
            return normalizedPage + '.html';
        } else {
            return '/' + normalizedPage;
        }
    }

    /**
     * Get admin URL
     * Usage: MicroafiaURL.getAdminUrl('appointments') 
     */
    function getAdminUrl(page) {
        const normalizedPage = page.replace('.html', '');
        
        if (isLocalDevelopment) {
            return 'admin/' + normalizedPage + '.html';
        } else {
            return '/admin/' + normalizedPage;
        }
    }

    // Auto-process links when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processAllLinks);
    } else {
        // DOM already loaded
        processAllLinks();
    }

    // Expose API globally
    window.MicroafiaURL = {
        isLocal: isLocalDevelopment,
        isProduction: isProduction,
        convert: convertUrl,
        navigate: navigateTo,
        getUrl: getUrl,
        getAdminUrl: getAdminUrl,
        processLinks: processAllLinks
    };

    // Log environment (remove in production if desired)
    console.log('[MicroafiaURL] Environment:', isLocalDevelopment ? 'LOCAL DEVELOPMENT' : 'PRODUCTION');

})();
