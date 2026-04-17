(function initExperimentalOverleafNativeSidebarHost(global) {
    'use strict';

    if (global.__experimentalOverleafNativeSidebarHost) return;

    const ACTIVE_KEY = 'experimental-overleaf-native-sidebar-active';
    const OPEN_KEY = 'experimental-overleaf-native-sidebar-open';
    const STYLE_ID = 'experimental-overleaf-native-sidebar-style';
    const PANEL_ATTR = 'data-experimental-overleaf-native-panel';
    const TAB_ATTR = 'data-experimental-overleaf-native-tab';

    const state = {
        panels: new Map(),
        activeId: localStorage.getItem(ACTIVE_KEY) || null,
        isOpen: localStorage.getItem(OPEN_KEY) === '1',
        footerText: '',
        refreshTimer: null,
        observer: null,
        lastHref: global.location.href,
    };

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function isVisible(element) {
        if (!element || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function getElementText(element) {
        return normalizeText([
            element?.textContent,
            element?.getAttribute?.('aria-label'),
            element?.getAttribute?.('title'),
            element?.getAttribute?.('data-testid'),
        ].filter(Boolean).join(' '));
    }

    function wait(ms) {
        return new Promise(resolve => global.setTimeout(resolve, ms));
    }

    function getProjectId() {
        const match = global.location.pathname.match(/\/project\/([^/]+)/);
        return match ? match[1] : null;
    }

    function getProjectName() {
        const selectors = [
            '.ide-redesign-toolbar-project-name',
            '[data-testid="project-name"]',
            'input[aria-label="Project name"]',
            'input[name="projectName"]',
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            const value = element?.value || element?.textContent;
            if (value && value.trim()) return value.trim();
        }

        return document.title.replace(/\s*-\s*Overleaf.*$/i, '').trim() || 'Untitled project';
    }

    function buildProjectUrl(suffix = '') {
        const projectId = getProjectId();
        if (!projectId) return global.location.origin;
        return `${global.location.origin}/project/${encodeURIComponent(projectId)}${suffix}`;
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    function readJson(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return parsed ?? fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function formatDateTime(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    function setFooterText(text = '') {
        state.footerText = String(text || '');
        const footer = document.querySelector(`.${PANEL_ATTR.replace(/[^a-z0-9-]/gi, '')}-footer`);
        if (footer) footer.textContent = state.footerText;
    }

    function persistState() {
        localStorage.setItem(ACTIVE_KEY, state.activeId || '');
        localStorage.setItem(OPEN_KEY, state.isOpen && state.activeId ? '1' : '0');
    }

    function getPanelApi(panelId) {
        return {
            getProjectId,
            getProjectName,
            buildProjectUrl,
            copyText,
            readJson,
            writeJson,
            formatDateTime,
            setFooterText,
            openPanel,
            closePanel,
            rerender: () => rerenderPanel(panelId),
            isActive: () => state.isOpen && state.activeId === panelId,
        };
    }

    function getAllVisibleButtons() {
        return [...document.querySelectorAll('button, [role="tab"], [role="button"]')].filter(isVisible);
    }

    function findFileTreeButton() {
        return getAllVisibleButtons()
            .map(element => {
                const text = getElementText(element);
                if (!text.includes('file tree')) return null;
                let score = 0;
                if (element.matches('button')) score += 4;
                if (element.getAttribute('role') === 'tab') score += 4;
                if (element.getAttribute('aria-selected') === 'true') score += 2;
                if (element.closest('nav, aside')) score += 1;
                return { element, score };
            })
            .filter(Boolean)
            .sort((left, right) => right.score - left.score)[0]?.element || null;
    }

    function findSelectedNativeTab() {
        return getAllVisibleButtons().find(element => {
            if (element.hasAttribute(TAB_ATTR)) return false;
            const text = getElementText(element);
            if (!text) return false;
            return element.getAttribute('aria-selected') === 'true'
                || element.getAttribute('aria-pressed') === 'true'
                || /selected|active/.test(`${element.className || ''}`);
        }) || null;
    }

    function findRailContainer(fileTreeButton) {
        if (!fileTreeButton) return null;

        let current = fileTreeButton;
        let best = fileTreeButton.parentElement;
        while (current && current !== document.body) {
            const rect = current.getBoundingClientRect();
            const buttons = [...current.querySelectorAll('button, [role="tab"], [role="button"]')].filter(isVisible);
            if (rect.width > 28 && rect.width <= 112 && rect.height >= 120 && buttons.length >= 1 && buttons.length <= 24) {
                best = current;
            }
            current = current.parentElement;
        }
        return best;
    }

    function getPanelCandidateScore(element) {
        if (!isVisible(element)) return -1;
        const rect = element.getBoundingClientRect();
        if (rect.width < 180 || rect.width > 560 || rect.height < 220 || rect.left > 280) return -1;
        const text = normalizeText(element.textContent);
        let score = 0;
        if (text.includes('file tree')) score += 8;
        if (text.includes('outline')) score += 4;
        if (text.includes('review')) score += 4;
        if (element.matches('aside')) score += 3;
        if (element.querySelector('button, [role="tab"], [role="button"]')) score += 1;
        return score;
    }

    function findSidebarPanelContainer() {
        return [...document.querySelectorAll('aside, section, div')]
            .map(element => ({ element, score: getPanelCandidateScore(element) }))
            .filter(candidate => candidate.score >= 0)
            .sort((left, right) => right.score - left.score)[0]?.element || null;
    }

    function resolveContext() {
        const fileTreeButton = findFileTreeButton();
        const railContainer = findRailContainer(fileTreeButton);
        const panelContainer = findSidebarPanelContainer();
        return {
            fileTreeButton,
            railContainer,
            panelContainer,
            selectedNativeTab: findSelectedNativeTab(),
        };
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            [${TAB_ATTR}] {
                position: relative;
            }

            [${TAB_ATTR}] svg {
                width: 20px;
                height: 20px;
                display: block;
                pointer-events: none;
            }

            [${PANEL_ATTR}] {
                position: absolute;
                inset: 0;
                z-index: 30;
                display: none;
                flex-direction: column;
                min-height: 0;
                background: var(--experimental-overleaf-sidebar-bg, #ffffff);
                color: var(--experimental-overleaf-sidebar-fg, #1f2937);
            }

            [${PANEL_ATTR}].is-open {
                display: flex;
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px;
                border-bottom: 1px solid var(--experimental-overleaf-sidebar-border, rgba(127, 127, 127, 0.2));
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-heading {
                min-width: 0;
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-title {
                margin: 0;
                font-size: 1rem;
                font-weight: 600;
                line-height: 1.3;
                color: inherit;
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-subtitle {
                margin: 4px 0 0;
                font-size: 0.8125rem;
                line-height: 1.4;
                color: var(--experimental-overleaf-sidebar-muted, rgba(87, 96, 106, 0.95));
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-close {
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-close:hover {
                background: var(--experimental-overleaf-sidebar-hover, rgba(127, 127, 127, 0.12));
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                box-sizing: border-box;
            }

            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-footer,
            .${PANEL_ATTR.replace(/[^a-z0-9-]/gi, '')}-footer {
                padding: 12px 16px 16px;
                border-top: 1px solid var(--experimental-overleaf-sidebar-border, rgba(127, 127, 127, 0.2));
                font-size: 0.75rem;
                line-height: 1.4;
                color: var(--experimental-overleaf-sidebar-muted, rgba(87, 96, 106, 0.95));
                min-height: 16px;
            }

            [${PANEL_ATTR}] .ol-native-sidebar-card {
                border: 1px solid var(--experimental-overleaf-sidebar-border, rgba(127, 127, 127, 0.2));
                border-radius: 12px;
                padding: 12px;
                background: var(--experimental-overleaf-sidebar-card-bg, rgba(255, 255, 255, 0.55));
                box-sizing: border-box;
            }

            [${PANEL_ATTR}] .ol-native-sidebar-muted {
                margin: 0;
                font-size: 0.875rem;
                line-height: 1.5;
                color: var(--experimental-overleaf-sidebar-muted, rgba(87, 96, 106, 0.95));
            }

            [${PANEL_ATTR}] .ol-native-sidebar-input,
            [${PANEL_ATTR}] .ol-native-sidebar-textarea {
                width: 100%;
                box-sizing: border-box;
                border: 1px solid var(--experimental-overleaf-sidebar-border, rgba(127, 127, 127, 0.25));
                border-radius: 10px;
                padding: 10px 12px;
                background: var(--experimental-overleaf-sidebar-input-bg, rgba(255, 255, 255, 0.92));
                color: inherit;
                font: inherit;
            }

            [${PANEL_ATTR}] .ol-native-sidebar-textarea {
                min-height: 240px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
            }

            [${PANEL_ATTR}] .ol-native-sidebar-button,
            [${PANEL_ATTR}] .ol-native-sidebar-link-button {
                border: 1px solid var(--experimental-overleaf-sidebar-border, rgba(127, 127, 127, 0.25));
                border-radius: 10px;
                padding: 8px 10px;
                background: var(--experimental-overleaf-sidebar-button-bg, rgba(127, 127, 127, 0.08));
                color: inherit;
                text-decoration: none;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 0.8125rem;
                font-weight: 600;
                line-height: 1.2;
                box-sizing: border-box;
            }

            [${PANEL_ATTR}] .ol-native-sidebar-button:hover,
            [${PANEL_ATTR}] .ol-native-sidebar-link-button:hover {
                background: var(--experimental-overleaf-sidebar-hover, rgba(127, 127, 127, 0.12));
            }

            [${PANEL_ATTR}] .ol-native-sidebar-list {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    function replaceButtonIcon(button, iconMarkup) {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = iconMarkup.trim();
        const icon = wrapper.firstElementChild;
        if (!icon) return;

        button.querySelectorAll('svg, img').forEach((element, index) => {
            if (index === 0) {
                element.replaceWith(icon.cloneNode(true));
            } else {
                element.remove();
            }
        });

        if (!button.querySelector('svg')) {
            button.textContent = '';
            button.appendChild(icon);
        }
    }

    function createCustomTabButton(panel, templateButton) {
        const button = templateButton.cloneNode(true);
        button.setAttribute(TAB_ATTR, panel.id);
        button.dataset.panelId = panel.id;
        button.title = panel.title;
        button.setAttribute('aria-label', panel.title);
        button.setAttribute('type', 'button');
        button.removeAttribute('id');
        button.removeAttribute('aria-controls');
        button.removeAttribute('aria-labelledby');
        button.removeAttribute('aria-describedby');
        button.removeAttribute('href');
        button.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        replaceButtonIcon(button, panel.icon);
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (state.isOpen && state.activeId === panel.id) {
                closePanel();
            } else {
                openPanel(panel.id);
            }
        }, true);
        return button;
    }

    function applyTheme(context, customPanel, customButtons) {
        const panelContainer = context.panelContainer;
        const fileTreeButton = context.fileTreeButton;
        const activeTab = context.selectedNativeTab || fileTreeButton;
        const panelStyles = panelContainer ? getComputedStyle(panelContainer) : null;
        const activeStyles = activeTab ? getComputedStyle(activeTab) : null;
        const buttonStyles = fileTreeButton ? getComputedStyle(fileTreeButton) : null;
        const root = customPanel;

        if (panelStyles) {
            root.style.setProperty('--experimental-overleaf-sidebar-bg', panelStyles.backgroundColor || '#ffffff');
            root.style.setProperty('--experimental-overleaf-sidebar-fg', panelStyles.color || '#1f2937');
            root.style.setProperty('--experimental-overleaf-sidebar-border', panelStyles.borderColor || 'rgba(127,127,127,0.2)');
        }
        root.style.setProperty('--experimental-overleaf-sidebar-muted', panelStyles?.color || 'rgba(87, 96, 106, 0.95)');
        root.style.setProperty('--experimental-overleaf-sidebar-hover', 'rgba(127, 127, 127, 0.12)');
        root.style.setProperty('--experimental-overleaf-sidebar-button-bg', 'rgba(127, 127, 127, 0.08)');
        root.style.setProperty('--experimental-overleaf-sidebar-input-bg', panelStyles?.backgroundColor || 'rgba(255,255,255,0.92)');
        root.style.setProperty('--experimental-overleaf-sidebar-card-bg', panelStyles?.backgroundColor || 'rgba(255,255,255,0.55)');

        customButtons.forEach(button => {
            button.style.color = buttonStyles?.color || '';
            button.style.background = 'transparent';
            if (state.isOpen && button.dataset.panelId === state.activeId) {
                button.style.background = activeStyles?.backgroundColor || 'rgba(25, 135, 84, 0.18)';
                button.style.color = activeStyles?.color || buttonStyles?.color || '';
                button.style.boxShadow = activeStyles?.boxShadow || 'none';
            } else {
                button.style.boxShadow = 'none';
            }
        });
    }

    function hideNativeSelections(context) {
        context.railContainer?.querySelectorAll('button, [role="tab"], [role="button"]').forEach(button => {
            if (button.hasAttribute(TAB_ATTR)) return;
            if (!isVisible(button)) return;
            button.addEventListener('click', () => {
                if (state.activeId) {
                    state.isOpen = false;
                    persistState();
                    sync();
                }
            }, { capture: true, once: true });
        });
    }

    function ensureCustomPanel(context) {
        if (!context.panelContainer) return null;
        let panelRoot = context.panelContainer.querySelector(`[${PANEL_ATTR}]`);
        if (!panelRoot) {
            panelRoot = document.createElement('section');
            panelRoot.setAttribute(PANEL_ATTR, 'true');
            const header = document.createElement('div');
            header.className = 'experimental-overleaf-native-sidebar-header';
            const heading = document.createElement('div');
            heading.className = 'experimental-overleaf-native-sidebar-heading';
            const title = document.createElement('h2');
            title.className = 'experimental-overleaf-native-sidebar-title';
            const subtitle = document.createElement('p');
            subtitle.className = 'experimental-overleaf-native-sidebar-subtitle';
            heading.append(title, subtitle);

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'experimental-overleaf-native-sidebar-close';
            close.setAttribute('aria-label', 'Close custom sidebar panel');
            close.textContent = '×';
            close.addEventListener('click', () => closePanel());

            header.append(heading, close);

            const body = document.createElement('div');
            body.className = 'experimental-overleaf-native-sidebar-body';
            const footer = document.createElement('div');
            footer.className = `${PANEL_ATTR.replace(/[^a-z0-9-]/gi, '')}-footer experimental-overleaf-native-sidebar-footer`;
            panelRoot.append(header, body, footer);
            context.panelContainer.style.position = context.panelContainer.style.position || 'relative';
            context.panelContainer.appendChild(panelRoot);
        }
        return panelRoot;
    }

    function renderPanelContent(context) {
        const panelDefinition = state.activeId ? state.panels.get(state.activeId) : null;
        const panelRoot = ensureCustomPanel(context);
        if (!panelRoot) return;

        if (!state.isOpen || !panelDefinition) {
            panelRoot.classList.remove('is-open');
            return;
        }

        const title = panelRoot.querySelector('.experimental-overleaf-native-sidebar-title');
        const subtitle = panelRoot.querySelector('.experimental-overleaf-native-sidebar-subtitle');
        const body = panelRoot.querySelector('.experimental-overleaf-native-sidebar-body');
        const footer = panelRoot.querySelector(`.${PANEL_ATTR.replace(/[^a-z0-9-]/gi, '')}-footer`);
        title.textContent = panelDefinition.title;
        subtitle.textContent = panelDefinition.subtitle || '';
        body.textContent = '';
        state.footerText = '';
        panelDefinition.render(body, getPanelApi(panelDefinition.id));
        footer.textContent = state.footerText;
        panelRoot.classList.add('is-open');
    }

    async function ensureSidebarOpen() {
        let context = resolveContext();
        if (context.panelContainer) return context;
        if (context.fileTreeButton) {
            context.fileTreeButton.click();
            await wait(180);
            context = resolveContext();
        }
        return context;
    }

    function syncTabs(context) {
        const template = context.fileTreeButton || context.railContainer?.querySelector('button, [role="tab"], [role="button"]');
        if (!context.railContainer || !template) return [];

        const buttons = [];
        [...state.panels.values()].sort((left, right) => (left.order || 0) - (right.order || 0)).forEach(panel => {
            let button = context.railContainer.querySelector(`[${TAB_ATTR}="${panel.id}"]`);
            if (!button) {
                button = createCustomTabButton(panel, template);
                context.railContainer.appendChild(button);
            }
            buttons.push(button);
        });
        return buttons;
    }

    async function sync() {
        const context = await ensureSidebarOpen();
        const buttons = syncTabs(context);
        const panelRoot = ensureCustomPanel(context);
        if (panelRoot) renderPanelContent(context);
        applyTheme(context, panelRoot || document.documentElement, buttons);
        hideNativeSelections(context);
    }

    function scheduleSync(delay = 0) {
        global.clearTimeout(state.refreshTimer);
        state.refreshTimer = global.setTimeout(() => {
            sync().catch(error => console.error('[experimental overleaf native sidebar]', error));
        }, delay);
    }

    function openPanel(panelId) {
        if (!state.panels.has(panelId)) return;
        state.activeId = panelId;
        state.isOpen = true;
        persistState();
        scheduleSync(0);
    }

    function closePanel() {
        state.isOpen = false;
        persistState();
        scheduleSync(0);
    }

    function rerenderPanel(panelId) {
        if (panelId && state.activeId !== panelId) {
            scheduleSync(0);
            return;
        }
        scheduleSync(0);
    }

    function registerPanel(panel) {
        if (!panel?.id || typeof panel.render !== 'function') {
            throw new Error('Experimental native sidebar panels require an id and render function.');
        }
        state.panels.set(panel.id, panel);
        if (!state.activeId) state.activeId = panel.id;
        persistState();
        scheduleSync(0);
    }

    function watchDom() {
        if (state.observer) return;
        state.observer = new MutationObserver(() => {
            if (state.lastHref !== global.location.href) {
                state.lastHref = global.location.href;
            }
            scheduleSync(120);
        });
        state.observer.observe(document.documentElement, { childList: true, subtree: true });
        global.addEventListener('popstate', () => scheduleSync(0));
        global.addEventListener('hashchange', () => scheduleSync(0));
        global.addEventListener('focus', () => scheduleSync(0));
    }

    ensureStyle();
    watchDom();

    global.__experimentalOverleafNativeSidebarHost = {
        registerPanel,
        rerenderPanel,
        openPanel,
        closePanel,
        getProjectId,
        getProjectName,
        buildProjectUrl,
        copyText,
        readJson,
        writeJson,
        formatDateTime,
        scheduleSync,
    };
})(window);
