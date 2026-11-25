// The Bloodline Show - lazy YouTube preview.
// The episode thumbnail shows first. When the section scrolls into view the
// YouTube player loads *underneath* it and the thumbnail only fades away once
// the video is really playing - so there is never a black box or a flash.
// The preview plays muted, restarts cleanly before YouTube's end screen,
// and pauses while scrolled off screen. Clicking plays it with sound.
// Staff can swap the episode from Admin > Bloodline Show > Show video; the
// change arrives here live (Firestore doc site_content/bloodline).
(function () {
    const box = document.querySelector('[data-bl-video]');
    if (!box) return;

    let id = box.dataset.videoId;
    let loadedId = null;           // the video the player currently holds
    let videoTitle = 'The Bloodline Show - In-Law or Outlaw? (S01 E22)';
    const facade = box.querySelector('[data-bl-play]');
    const thumb = facade.querySelector('img');
    const epLabel = document.querySelector('.bl-episode');
    const epTitle = document.querySelector('.bl-ep-title');
    let creating = false;
    let readinessTimer;
    let player = null, ready = false, wantSound = false, inView = false, failed = false, loopTimer = null;

    // Fall back to the smaller thumbnail if the HD one is missing
    thumb.addEventListener('error', () => {
        if (thumb.src.includes('maxresdefault')) thumb.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    });

    function loadApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.async = true;
            s.onerror = reject;
            document.head.appendChild(s);
            setTimeout(() => reject(new Error('timeout')), 12000);
        });
    }

    // If the player can't load, clicking opens the episode on YouTube instead
    function fail() {
        clearTimeout(readinessTimer);
        failed = true;
        creating = false;
        clearInterval(loopTimer);
        box.dataset.state = 'failed';
        box.classList.remove('is-loading', 'is-playing');
        const holder = box.querySelector('.bl-player');
        if (holder) holder.remove();
    }

    function showVideo() { box.classList.remove('is-loading'); box.classList.add('is-playing'); }

    // Restart just before the end so YouTube's end screen never appears
    function watchLoop() {
        clearInterval(loopTimer);
        loopTimer = setInterval(() => {
            if (!ready || wantSound) return;
            const d = player.getDuration(), t = player.getCurrentTime();
            if (d && t > d - 1.2) player.seekTo(0, true);
        }, 500);
    }

    function create() {
        if (creating || player || failed) return;
        creating = true;
        box.classList.add('is-loading');
        // Never pulse forever: if it hasn't started in 10s, settle on the thumbnail
        setTimeout(() => box.classList.remove('is-loading'), 10000);
        const holder = document.createElement('div');
        holder.className = 'bl-player';
        box.prepend(holder);

        const startId = id;
        loadApi().then(() => {
            const vars = {
                autoplay: (inView || wantSound) ? 1 : 0, mute: wantSound ? 0 : 1, playsinline: 1,
                rel: 0, modestbranding: 1, controls: 1, iv_load_policy: 3, enablejsapi: 1
            };
            if (/^https?:/.test(location.origin)) vars.origin = location.origin;  // avoids YouTube Error 153
            readinessTimer = setTimeout(fail, 12000);
            player = new YT.Player(holder, {
                host: 'https://www.youtube-nocookie.com',
                videoId: startId,
                playerVars: vars,
                events: {
                    onReady: () => {
                        clearTimeout(readinessTimer);
                        if (failed) return;
                        creating = false;
                        ready = true;
                        loadedId = startId;
                        box.dataset.state = 'ready';
                        const f = player.getIframe();
                        f.title = videoTitle;
                        f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
                        f.referrerPolicy = 'strict-origin-when-cross-origin';
                        if (wantSound) player.unMute(); else player.mute();
                        if (loadedId !== id) switchPlayer();       // a newer episode arrived while loading
                        else if (inView || wantSound) player.playVideo();
                        watchLoop();
                    },
                    onStateChange: (e) => {
                        box.dataset.state = String(e.data);
                        if (e.data === YT.PlayerState.PLAYING) showVideo();
                        if (e.data === YT.PlayerState.ENDED && !wantSound) { player.seekTo(0, true); player.playVideo(); }
                    },
                    onError: fail
                }
            });
        }).catch(fail);
    }

    // ---- swapping to another episode (live from the admin) ----
    function switchPlayer() {
        loadedId = id;
        box.classList.remove('is-playing');        // show the new thumbnail until it plays
        const f = player.getIframe && player.getIframe();
        if (f) f.title = videoTitle;
        if (inView || wantSound) player.loadVideoById(id); else player.cueVideoById(id);
    }

    function setVideo(data) {
        if (!data || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId || '')) return;
        const episode = String(data.episode || '').trim();
        const title = String(data.title || '').trim();
        if (epLabel) epLabel.innerHTML = '<i class="fas fa-circle"></i> ' + (episode ? 'Latest episode &middot; ' : 'Latest episode');
        if (epLabel && episode) epLabel.append(episode);
        if (epTitle) epTitle.textContent = title;
        videoTitle = 'The Bloodline Show' + (title ? ' - ' + title : '') + (episode ? ` (${episode})` : '');
        thumb.alt = videoTitle + ' episode';
        if (data.videoId === id) return;
        id = data.videoId;
        box.dataset.videoId = id;
        facade.href = `https://www.youtube.com/watch?v=${id}`;
        thumb.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
        if (failed) {                               // give the new link a fresh player
            failed = false; player = null; ready = false; loadedId = null;
            delete box.dataset.state;
            if (inView) create();
        } else if (ready) {
            switchPlayer();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof db === 'undefined' || !db) return;
        db.collection('site_content').doc('bloodline').onSnapshot(
            doc => { if (doc.exists) setVideo(doc.data()); },
            () => { /* keep the built-in episode if the setting can't be read */ });
    });

    facade.addEventListener('click', event => {
        if (failed || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        wantSound = true;
        if (ready) { player.unMute(); player.seekTo(0, true); player.playVideo(); }
        else create();
    });

    // Always auto-plays (muted). The player is loaded a little before the
    // section is reached, so the video is already running when it appears,
    // and it pauses while scrolled off screen.
    if ('IntersectionObserver' in window) {
        const preload = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) { create(); preload.disconnect(); }
        }, { rootMargin: '600px 0px' });
        preload.observe(box);

        new IntersectionObserver(entries => {
            inView = entries[entries.length - 1].intersectionRatio >= 0.35;
            if (!ready || failed) return;
            if (inView) player.playVideo();
            else if (!wantSound) player.pauseVideo();
        }, { threshold: 0.35 }).observe(box);
    } else {
        inView = true;
        create();
    }
})();
