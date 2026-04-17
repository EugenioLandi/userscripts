(function initExperimentalOverleafNativeSidebarHost(global) {
    'use strict';

    if (global.__experimentalOverleafNativeSidebarHost) return;

    const ACTIVE_KEY = 'experimental-overleaf-native-sidebar-active';
    const OPEN_KEY = 'experimental-overleaf-native-sidebar-open';
    const STYLE_ID = 'experimental-overleaf-native-sidebar-style';
    const PANEL_ATTR = 'data-experimental-overleaf-native-panel';
    const TAB_ATTR = 'data-experimental-overleaf-native-tab';
    const FOOTER_CLASS = 'experimental-overleaf-native-sidebar-footer-slot';
    const NATIVE_TABS_WRAPPER_SELECTOR = '.ide-rail-tabs-wrapper';
    const NATIVE_TAB_CONTENT_SELECTOR = '.ide-rail-content .ide-rail-tab-content';
    const NATIVE_FILE_TREE_TAB_SELECTOR = '[data-rr-ui-event-key="file-tree"]';
    const NATIVE_ACTIVE_TAB_SELECTOR = '[role="tab"][aria-selected="true"]';
    const NATIVE_ACTIVE_PANE_SELECTOR = '.tab-pane.active[role="tabpanel"]';
    const SIDEBAR_OPEN_DELAY_MS = 180;
    const DOM_SYNC_DEBOUNCE_MS = 120;

    const state = {
        panels: new Map(),
        renderVersions: new Map(),
        activeId: localStorage.getItem(ACTIVE_KEY) || null,
        isOpen: localStorage.getItem(OPEN_KEY) === '1',
        footerText: '',
        refreshTimer: null,
        observer: null,
        lastHref: global.location.href,
        lastNativeTabId: null,
        lastNativePaneId: null,
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

    function getCurrentProjectIdOrEmpty() {
        return getProjectId() || '';
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
        if (typeof document.execCommand === 'function' && document.queryCommandSupported?.('copy') !== false) {
            document.execCommand('copy');
        }
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
        const footer = document.querySelector(`.${FOOTER_CLASS}`);
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

    function getNativeTabs(tabsWrapper) {
        return tabsWrapper
            ? [...tabsWrapper.children].filter(element => element.getAttribute('role') === 'tab' && !element.hasAttribute(TAB_ATTR))
            : [];
    }

    function findNativeActiveTab(tabsWrapper) {
        return tabsWrapper?.querySelector(NATIVE_ACTIVE_TAB_SELECTOR) || null;
    }

    function findNativeActivePane(tabContent, activeTab) {
        const controlledPane = activeTab?.getAttribute('aria-controls')
            ? document.getElementById(activeTab.getAttribute('aria-controls'))
            : null;
        if (controlledPane) return controlledPane;
        return tabContent?.querySelector(NATIVE_ACTIVE_PANE_SELECTOR) || null;
    }

    function resolveContext() {
        const tabsWrapper = document.querySelector(NATIVE_TABS_WRAPPER_SELECTOR);
        const fileTreeButton = tabsWrapper?.querySelector(NATIVE_FILE_TREE_TAB_SELECTOR) || null;
        const templateButton = fileTreeButton || getNativeTabs(tabsWrapper)[0] || null;
        const tabContent = document.querySelector(NATIVE_TAB_CONTENT_SELECTOR);
        const activeNativeTab = findNativeActiveTab(tabsWrapper);
        const activeNativePane = findNativeActivePane(tabContent, activeNativeTab);
        return {
            fileTreeButton,
            tabsWrapper,
            templateButton,
            tabContent,
            activeNativeTab,
            activeNativePane,
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
                display: none;
                flex-direction: column;
                height: 100%;
                min-height: 0;
                background: var(--experimental-overleaf-sidebar-bg, #ffffff);
                color: var(--experimental-overleaf-sidebar-fg, #1f2937);
            }

            [${PANEL_ATTR}].is-open,
            [${PANEL_ATTR}].active {
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

            .${FOOTER_CLASS} {
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
        icon.classList.add('ide-rail-tab-link-icon');
        button.replaceChildren(icon);
    }

    function createCustomTabButton(panel, templateButton) {
        const button = document.createElement('button');
        button.className = templateButton.className;
        button.setAttribute(TAB_ATTR, panel.id);
        button.dataset.panelId = panel.id;
        button.dataset.rrUiEventKey = panel.id;
        button.title = panel.title;
        button.setAttribute('aria-label', panel.title);
        button.setAttribute('type', 'button');
        button.setAttribute('role', 'tab');
        button.id = `experimental-overleaf-native-sidebar-tab-${panel.id}`;
        button.setAttribute('aria-controls', `experimental-overleaf-native-sidebar-pane-${panel.id}`);
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('tabindex', '-1');
        button.classList.remove('active', 'open-rail');
        replaceButtonIcon(button, panel.icon);
        const label = document.createElement('span');
        label.className = 'visually-hidden';
        label.textContent = panel.title;
        button.appendChild(label);
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
        const panelContainer = context.activeNativePane || context.tabContent;
        const fileTreeButton = context.fileTreeButton;
        const activeTab = context.activeNativeTab || fileTreeButton;
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

    function bindNativeTabHandlers(context) {
        getNativeTabs(context.tabsWrapper).forEach(button => {
            if (button.dataset.experimentalOverleafNativeSidebarBound === '1') return;
            button.dataset.experimentalOverleafNativeSidebarBound = '1';
            button.addEventListener('click', () => {
                state.lastNativeTabId = button.id || state.lastNativeTabId;
                state.lastNativePaneId = button.getAttribute('aria-controls') || state.lastNativePaneId;
                if (state.isOpen) {
                    state.isOpen = false;
                    persistState();
                    scheduleSync(SIDEBAR_OPEN_DELAY_MS);
                }
            });
        });
    }

    function ensureCustomPanel(context, panel) {
        if (!context.tabContent) return null;
        let panelRoot = context.tabContent.querySelector(`[${TAB_ATTR}="${panel.id}"][${PANEL_ATTR}]`);
        if (!panelRoot) {
            panelRoot = document.createElement('div');
            panelRoot.setAttribute(PANEL_ATTR, 'true');
            panelRoot.setAttribute(TAB_ATTR, panel.id);
            panelRoot.setAttribute('role', 'tabpanel');
            panelRoot.id = `experimental-overleaf-native-sidebar-pane-${panel.id}`;
            panelRoot.setAttribute('aria-labelledby', `experimental-overleaf-native-sidebar-tab-${panel.id}`);
            panelRoot.className = 'tab-pane';
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
            footer.className = FOOTER_CLASS;
            panelRoot.append(header, body, footer);
            context.tabContent.appendChild(panelRoot);
        }
        return panelRoot;
    }

    function renderPanelContent(context, panelDefinition) {
        const panelRoot = ensureCustomPanel(context, panelDefinition);
        if (!panelRoot) return;

        const title = panelRoot.querySelector('.experimental-overleaf-native-sidebar-title');
        const subtitle = panelRoot.querySelector('.experimental-overleaf-native-sidebar-subtitle');
        const body = panelRoot.querySelector('.experimental-overleaf-native-sidebar-body');
        const footer = panelRoot.querySelector(`.${FOOTER_CLASS}`);
        title.textContent = panelDefinition.title;
        subtitle.textContent = panelDefinition.subtitle || '';
        body.textContent = '';
        state.footerText = '';
        panelDefinition.render(body, getPanelApi(panelDefinition.id));
        footer.textContent = state.footerText;
        panelRoot.dataset.experimentalOverleafSidebarProjectId = getCurrentProjectIdOrEmpty();
        panelRoot.dataset.experimentalOverleafSidebarRenderVersion = String(state.renderVersions.get(panelDefinition.id) || 0);
        panelRoot.classList.add('is-open');
    }

    function shouldRenderPanel(panelRoot, panelDefinition) {
        if (!panelRoot) return true;
        const currentProjectId = getCurrentProjectIdOrEmpty();
        const currentRenderVersion = String(state.renderVersions.get(panelDefinition.id) || 0);
        if (panelRoot.dataset.experimentalOverleafSidebarProjectId !== currentProjectId) return true;
        if (panelRoot.dataset.experimentalOverleafSidebarRenderVersion !== currentRenderVersion) return true;
        const body = panelRoot.querySelector('.experimental-overleaf-native-sidebar-body');
        return !body || !body.hasChildNodes();
    }

    async function ensureSidebarOpen() {
        let context = resolveContext();
        if (context.tabContent) return context;
        if (context.fileTreeButton && isVisible(context.fileTreeButton)) {
            context.fileTreeButton.click();
            await wait(SIDEBAR_OPEN_DELAY_MS);
            context = resolveContext();
        }
        return context;
    }

    function syncTabs(context) {
        const template = context.templateButton;
        if (!context.tabsWrapper || !template) return [];

        const buttons = [];
        [...state.panels.values()].sort((left, right) => (left.order || 0) - (right.order || 0)).forEach(panel => {
            let button = context.tabsWrapper.querySelector(`[${TAB_ATTR}="${panel.id}"]`);
            if (!button) {
                button = createCustomTabButton(panel, template);
                context.tabsWrapper.appendChild(button);
            }
            buttons.push(button);
        });
        return buttons;
    }

    function setTabState(button, isActive) {
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        button.setAttribute('tabindex', isActive ? '0' : '-1');
        button.classList.toggle('active', isActive);
        button.classList.toggle('open-rail', isActive);
    }

    function setPaneState(pane, isActive) {
        pane.classList.toggle('active', isActive);
        pane.classList.toggle('is-open', isActive);
        pane.hidden = !isActive;
    }

    function rememberNativeSelection(context) {
        state.lastNativeTabId = context.activeNativeTab?.id || state.lastNativeTabId;
        state.lastNativePaneId = context.activeNativePane?.id || state.lastNativePaneId;
    }

    function syncPanels(context) {
        if (!context.tabContent) return [];
        return [...state.panels.values()]
            .sort((left, right) => (left.order || 0) - (right.order || 0))
            .map(panel => ensureCustomPanel(context, panel))
            .filter(Boolean);
    }

    function updateSelectionState(context, customButtons, customPanels) {
        const nativeTabs = getNativeTabs(context.tabsWrapper);
        const nativePanes = context.tabContent
            ? [...context.tabContent.querySelectorAll('[role="tabpanel"]')].filter(pane => !pane.hasAttribute(PANEL_ATTR))
            : [];

        if (state.isOpen && state.activeId) {
            nativeTabs.forEach(button => setTabState(button, false));
            nativePanes.forEach(pane => setPaneState(pane, false));
            customButtons.forEach(button => setTabState(button, button.dataset.panelId === state.activeId));
            customPanels.forEach(panel => setPaneState(panel, panel.getAttribute(TAB_ATTR) === state.activeId));
            return;
        }

        customButtons.forEach(button => setTabState(button, false));
        customPanels.forEach(panel => setPaneState(panel, false));

        const nativeTabToRestore = nativeTabs.find(button => button.id === state.lastNativeTabId) || context.activeNativeTab || nativeTabs[0];
        const nativePaneToRestore = nativeTabToRestore?.getAttribute('aria-controls')
            ? document.getElementById(nativeTabToRestore.getAttribute('aria-controls'))
            : nativePanes.find(pane => pane.id === state.lastNativePaneId) || context.activeNativePane || nativePanes[0];

        nativeTabs.forEach(button => setTabState(button, button === nativeTabToRestore));
        nativePanes.forEach(pane => setPaneState(pane, pane === nativePaneToRestore));
    }

    async function sync() {
        const context = await ensureSidebarOpen();
        if (!context.tabsWrapper || !context.tabContent) return;
        bindNativeTabHandlers(context);
        const buttons = syncTabs(context);
        const panels = syncPanels(context);

        const activePanel = state.isOpen && state.activeId ? state.panels.get(state.activeId) : null;
        if (activePanel) {
            let activePanelRoot = panels.find(panel => panel.getAttribute(TAB_ATTR) === state.activeId) || null;
            if (!activePanelRoot) {
                activePanelRoot = ensureCustomPanel(context, activePanel);
            }
            if (shouldRenderPanel(activePanelRoot, activePanel)) {
                renderPanelContent(context, activePanel);
            }
        }

        updateSelectionState(context, buttons, panels);
        const activeCustomPanel = panels.find(panel => panel.getAttribute(TAB_ATTR) === state.activeId) || context.activeNativePane;
        applyTheme(context, activeCustomPanel || document.documentElement, buttons);
    }

    function scheduleSync(delay = 0) {
        global.clearTimeout(state.refreshTimer);
        state.refreshTimer = global.setTimeout(() => {
            sync().catch(error => console.error('[experimental overleaf native sidebar]', error));
        }, delay);
    }

    function openPanel(panelId) {
        if (!state.panels.has(panelId)) return;
        rememberNativeSelection(resolveContext());
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
        if (panelId) {
            state.renderVersions.set(panelId, (state.renderVersions.get(panelId) || 0) + 1);
        }
        scheduleSync(0);
    }

    function isPanelActive(panelId) {
        return state.isOpen && state.activeId === panelId;
    }

    function registerPanel(panel) {
        if (!panel?.id || typeof panel.render !== 'function') {
            throw new Error('Experimental native sidebar panels require an id and render function.');
        }
        state.panels.set(panel.id, panel);
        if (!state.renderVersions.has(panel.id)) state.renderVersions.set(panel.id, 0);
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
            scheduleSync(DOM_SYNC_DEBOUNCE_MS);
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
        isPanelActive,
        scheduleSync,
    };
})(window);
