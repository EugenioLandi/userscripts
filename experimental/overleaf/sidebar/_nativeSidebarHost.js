(function initExperimentalOverleafNativeSidebarHost(global) {
    'use strict';

    if (global.__experimentalOverleafNativeSidebarHost) return;

    const ACTIVE_KEY = 'experimental-overleaf-native-sidebar-active';
    const OPEN_KEY = 'experimental-overleaf-native-sidebar-open';
    const STYLE_ID = 'experimental-overleaf-native-sidebar-style';
    const PANEL_ATTR = 'data-experimental-overleaf-native-panel';
    const TAB_ATTR = 'data-experimental-overleaf-native-tab';
    const FOOTER_CLASS = 'experimental-overleaf-native-sidebar-footer-slot';
    const CONTAINER_ID = 'experimental-overleaf-native-sidebar-panels';
    const MODE_ATTR = 'data-experimental-sidebar-mode';
    const ACTIVE_TAB_ATTR = 'data-experimental-sidebar-active';
    const NATIVE_TABS_WRAPPER_SELECTOR = '.ide-rail-tabs-wrapper';
    const NATIVE_TAB_CONTENT_SELECTOR = '.ide-rail-content .ide-rail-tab-content';
    const NATIVE_FILE_TREE_TAB_SELECTOR = '[data-rr-ui-event-key="file-tree"]';
    const SIDEBAR_TOGGLE_BUTTON_SELECTOR = '.horizontal-resize-handle .custom-toggler';
    const SIDEBAR_OPEN_DELAY_MS = 200;
    const DOM_SYNC_DEBOUNCE_MS = 150;

    const state = {
        panels: new Map(),
        renderVersions: new Map(),
        activeId: localStorage.getItem(ACTIVE_KEY) || null,
        isOpen: localStorage.getItem(OPEN_KEY) === '1',
        footerText: '',
        refreshTimer: null,
        observer: null,
        lastHref: global.location.href,
    };

    function isVisible(element) {
        if (!element || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
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
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // localStorage quota exceeded — silently drop the write
        }
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
        try {
            localStorage.setItem(ACTIVE_KEY, state.activeId || '');
            localStorage.setItem(OPEN_KEY, state.isOpen && state.activeId ? '1' : '0');
        } catch {
            // localStorage quota exceeded — silently drop the write
        }
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
            ? [...tabsWrapper.children].filter(el => el.getAttribute('role') === 'tab' && !el.hasAttribute(TAB_ATTR))
            : [];
    }

    function getActiveNativeTab(tabsWrapper) {
        return getNativeTabs(tabsWrapper).find(button => button.getAttribute('aria-selected') === 'true') || null;
    }

    function resolveContext() {
        const tabsWrapper = document.querySelector(NATIVE_TABS_WRAPPER_SELECTOR);
        const fileTreeButton = tabsWrapper?.querySelector(NATIVE_FILE_TREE_TAB_SELECTOR) || null;
        const templateButton = fileTreeButton || getNativeTabs(tabsWrapper)[0] || null;
        const tabContent = document.querySelector(NATIVE_TAB_CONTENT_SELECTOR);
        const railContent = tabContent?.closest('.ide-rail-content') || null;
        const sidebarToggleButton = document.querySelector(SIDEBAR_TOGGLE_BUTTON_SELECTOR);
        return { tabsWrapper, fileTreeButton, templateButton, tabContent, railContent, sidebarToggleButton };
    }

    function ensurePanelContainer(railContent) {
        if (!railContent) return null;
        let container = railContent.querySelector(`#${CONTAINER_ID}`);
        if (!container) {
            container = document.createElement('div');
            container.id = CONTAINER_ID;
            railContent.appendChild(container);
        }
        return container;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* ---- custom panel container ---- */
            #${CONTAINER_ID} {
                display: none;
                flex-direction: column;
                height: 100%;
                min-height: 0;
            }
            .ide-rail-content[${MODE_ATTR}="custom"] > .ide-rail-tab-content {
                display: none !important;
            }
            .ide-rail-content[${MODE_ATTR}="custom"] > #${CONTAINER_ID} {
                display: flex !important;
            }

            /* ---- native tab de-emphasis when custom panel active ---- */
            .ide-rail-tabs-wrapper[${ACTIVE_TAB_ATTR}] > .nav-link.active:not([${TAB_ATTR}]),
            .ide-rail-tabs-wrapper[${ACTIVE_TAB_ATTR}] > .nav-link.open-rail:not([${TAB_ATTR}]) {
                background-color: transparent !important;
                box-shadow: none !important;
            }

            /* ---- tab button icons ---- */
            [${TAB_ATTR}] {
                position: relative;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                box-sizing: border-box;
                transition: background-color 0.15s ease, box-shadow 0.15s ease;
            }
            [${TAB_ATTR}] .ide-rail-tab-link-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                line-height: 1;
                pointer-events: none;
            }
            [${TAB_ATTR}] .ide-rail-tab-link-icon svg {
                width: 20px;
                height: 20px;
                display: block;
                flex: 0 0 auto;
                pointer-events: none;
            }

            /* ---- panel root ---- */
            [${PANEL_ATTR}] {
                display: none;
                flex-direction: column;
                height: 100%;
                min-height: 0;
                background: var(--ol-sidebar-bg, #fff);
                color: var(--ol-sidebar-fg, #1b2733);
            }
            [${PANEL_ATTR}].is-open {
                display: flex;
            }

            /* ---- panel header ---- */
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 14px 16px;
                border-bottom: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
            }
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-heading {
                min-width: 0;
            }
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-title {
                margin: 0;
                font-size: 0.9375rem;
                font-weight: 700;
                line-height: 1.35;
                color: inherit;
            }
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-subtitle {
                margin: 3px 0 0;
                font-size: 0.75rem;
                line-height: 1.45;
                color: var(--ol-sidebar-muted, rgba(90, 100, 110, 0.88));
            }

            /* ---- close button ---- */
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-close {
                flex-shrink: 0;
                width: 28px;
                height: 28px;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font-size: 17px;
                line-height: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.12s ease;
            }
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-close:hover {
                background: var(--ol-sidebar-hover, rgba(125, 125, 125, 0.1));
            }
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-close:focus-visible {
                outline: 2px solid var(--ol-sidebar-focus, #1a73e8);
                outline-offset: 1px;
            }

            /* ---- panel body ---- */
            [${PANEL_ATTR}] .experimental-overleaf-native-sidebar-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow: auto;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                box-sizing: border-box;
            }

            /* ---- footer ---- */
            .${FOOTER_CLASS} {
                padding: 10px 16px 14px;
                border-top: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
                font-size: 0.6875rem;
                line-height: 1.45;
                color: var(--ol-sidebar-muted, rgba(90, 100, 110, 0.88));
                min-height: 14px;
            }

            /* ---- cards ---- */
            [${PANEL_ATTR}] .ol-native-sidebar-card {
                border: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
                border-radius: 6px;
                padding: 10px 12px;
                background: var(--ol-sidebar-card-bg, rgba(255, 255, 255, 0.5));
                box-sizing: border-box;
            }

            /* ---- muted text ---- */
            [${PANEL_ATTR}] .ol-native-sidebar-muted {
                margin: 0;
                font-size: 0.8125rem;
                line-height: 1.5;
                color: var(--ol-sidebar-muted, rgba(90, 100, 110, 0.88));
            }

            /* ---- form controls ---- */
            [${PANEL_ATTR}] .ol-native-sidebar-input,
            [${PANEL_ATTR}] .ol-native-sidebar-textarea {
                width: 100%;
                box-sizing: border-box;
                border: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.22));
                border-radius: 6px;
                padding: 8px 10px;
                background: var(--ol-sidebar-input-bg, rgba(255, 255, 255, 0.88));
                color: inherit;
                font: inherit;
                font-size: 0.8125rem;
                transition: border-color 0.12s ease;
            }
            [${PANEL_ATTR}] .ol-native-sidebar-input:focus,
            [${PANEL_ATTR}] .ol-native-sidebar-textarea:focus {
                border-color: var(--ol-sidebar-focus, #1a73e8);
                outline: none;
            }
            [${PANEL_ATTR}] .ol-native-sidebar-textarea {
                min-height: 200px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
                font-size: 0.75rem;
                line-height: 1.55;
            }

            /* ---- buttons ---- */
            [${PANEL_ATTR}] .ol-native-sidebar-button,
            [${PANEL_ATTR}] .ol-native-sidebar-link-button {
                border: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.22));
                border-radius: 6px;
                padding: 6px 10px;
                background: var(--ol-sidebar-button-bg, rgba(125, 125, 125, 0.06));
                color: inherit;
                text-decoration: none;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                font-size: 0.75rem;
                font-weight: 600;
                line-height: 1.3;
                box-sizing: border-box;
                transition: background-color 0.12s ease;
            }
            [${PANEL_ATTR}] .ol-native-sidebar-button:hover,
            [${PANEL_ATTR}] .ol-native-sidebar-link-button:hover {
                background: var(--ol-sidebar-hover, rgba(125, 125, 125, 0.1));
            }
            [${PANEL_ATTR}] .ol-native-sidebar-button:focus-visible,
            [${PANEL_ATTR}] .ol-native-sidebar-link-button:focus-visible {
                outline: 2px solid var(--ol-sidebar-focus, #1a73e8);
                outline-offset: 1px;
            }

            /* ---- lists ---- */
            [${PANEL_ATTR}] .ol-native-sidebar-list {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            /* ---- dark mode adjustments ---- */
            .overall-theme-dark [${PANEL_ATTR}],
            [data-theme="dark"] [${PANEL_ATTR}] {
                --ol-sidebar-bg: #1b2733;
                --ol-sidebar-fg: #d9e0e8;
                --ol-sidebar-border: rgba(200, 210, 220, 0.12);
                --ol-sidebar-muted: rgba(180, 190, 200, 0.72);
                --ol-sidebar-hover: rgba(200, 210, 220, 0.08);
                --ol-sidebar-button-bg: rgba(200, 210, 220, 0.06);
                --ol-sidebar-input-bg: rgba(0, 0, 0, 0.18);
                --ol-sidebar-card-bg: rgba(255, 255, 255, 0.04);
                --ol-sidebar-focus: #5ca0e8;
            }
        `;
        document.head.appendChild(style);
    }

    function replaceButtonIcon(button, iconMarkup) {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = iconMarkup.trim();
        const icon = wrapper.firstElementChild;
        if (!icon) return;
        const iconSlot = document.createElement('span');
        iconSlot.className = 'ide-rail-tab-link-icon';
        iconSlot.setAttribute('aria-hidden', 'true');
        iconSlot.appendChild(icon);
        button.replaceChildren(iconSlot);
    }

    // FIX 1: Do not clone the native button's className wholesale.
    // The native classes (nav-link, etc.) carry Overleaf's own padding and
    // display rules that fight the centering CSS on [TAB_ATTR]. Instead,
    // only carry over the structural/sizing classes that control button
    // dimensions (e.g. "nav-link"), and let our own [TAB_ATTR] rule
    // override display/alignment with !important.
    function createCustomTabButton(panel, templateButton) {
        const button = document.createElement('button');

        // Copy only the classes that govern button size/shape, not layout overrides.
        // We keep nav-link (if present) so the button matches native dimensions,
        // but we deliberately skip any class that sets padding or display directly
        // since [TAB_ATTR] CSS handles those with higher specificity via !important.
        const nativeClasses = [...templateButton.classList].filter(cls =>
            // Keep structural shape classes, drop anything that sets its own
            // flex/inline-block layout that would compete with our centering.
            !['d-flex', 'flex-column', 'align-items-center', 'justify-content-center',
              'text-center', 'p-0', 'px-0', 'py-0'].includes(cls)
        );
        button.className = nativeClasses.join(' ');

        button.setAttribute(TAB_ATTR, panel.id);
        button.dataset.panelId = panel.id;
        button.dataset.rrUiEventKey = panel.id;
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

    function detectThemeColors(context) {
        const nativePane = context.tabContent?.querySelector('.tab-pane.active') || context.tabContent;
        const paneStyles = nativePane ? getComputedStyle(nativePane) : null;
        const bg = paneStyles?.backgroundColor || '';
        const fg = paneStyles?.color || '';
        const border = paneStyles?.borderColor || '';
        const isDark = bg && parseLuminance(bg) < 0.35;
        return {
            bg: bg || (isDark ? '#1b2733' : '#fff'),
            fg: fg || (isDark ? '#d9e0e8' : '#1b2733'),
            border: border || (isDark ? 'rgba(200,210,220,0.12)' : 'rgba(125,125,125,0.18)'),
            muted: isDark ? 'rgba(180,190,200,0.72)' : 'rgba(90,100,110,0.88)',
            hover: isDark ? 'rgba(200,210,220,0.08)' : 'rgba(125,125,125,0.1)',
            buttonBg: isDark ? 'rgba(200,210,220,0.06)' : 'rgba(125,125,125,0.06)',
            inputBg: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.88)',
            cardBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)',
            focus: isDark ? '#5ca0e8' : '#1a73e8',
        };
    }

    function parseLuminance(colorString) {
        const m = colorString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return 0.5;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    function applyTheme(context, panelContainer, customButtons) {
        const colors = detectThemeColors(context);
        const root = panelContainer;
        if (!root) return;
        root.style.setProperty('--ol-sidebar-bg', colors.bg);
        root.style.setProperty('--ol-sidebar-fg', colors.fg);
        root.style.setProperty('--ol-sidebar-border', colors.border);
        root.style.setProperty('--ol-sidebar-muted', colors.muted);
        root.style.setProperty('--ol-sidebar-hover', colors.hover);
        root.style.setProperty('--ol-sidebar-button-bg', colors.buttonBg);
        root.style.setProperty('--ol-sidebar-input-bg', colors.inputBg);
        root.style.setProperty('--ol-sidebar-card-bg', colors.cardBg);
        root.style.setProperty('--ol-sidebar-focus', colors.focus);

        const fileTreeButton = context.fileTreeButton;
        const buttonStyles = fileTreeButton ? getComputedStyle(fileTreeButton) : null;
        const activeNativeTab = getActiveNativeTab(context.tabsWrapper);
        const activeStyles = activeNativeTab ? getComputedStyle(activeNativeTab) : null;

        customButtons.forEach(button => {
            button.style.removeProperty('color');
            button.style.removeProperty('background');
            button.style.removeProperty('background-color');
            button.style.removeProperty('box-shadow');
            if (state.isOpen && button.dataset.panelId === state.activeId) {
                button.style.backgroundColor = activeStyles?.backgroundColor || 'rgba(25, 135, 84, 0.18)';
                button.style.color = activeStyles?.color || buttonStyles?.color || '';
                button.style.boxShadow = activeStyles?.boxShadow || 'none';
            }
        });
    }

    function bindNativeTabHandlers(context) {
        getNativeTabs(context.tabsWrapper).forEach(button => {
            if (button.dataset.experimentalOverleafNativeSidebarBound === '1') return;
            button.dataset.experimentalOverleafNativeSidebarBound = '1';
            button.addEventListener('click', () => {
                if (state.isOpen) {
                    state.isOpen = false;
                    persistState();
                    scheduleSync(0);
                }
            });
        });
    }

    function ensureCustomPanel(panelContainer, panel) {
        if (!panelContainer) return null;
        let panelRoot = panelContainer.querySelector(`[${TAB_ATTR}="${panel.id}"][${PANEL_ATTR}]`);
        if (!panelRoot) {
            panelRoot = document.createElement('div');
            panelRoot.setAttribute(PANEL_ATTR, 'true');
            panelRoot.setAttribute(TAB_ATTR, panel.id);
            panelRoot.setAttribute('role', 'tabpanel');
            panelRoot.id = `experimental-overleaf-native-sidebar-pane-${panel.id}`;
            panelRoot.setAttribute('aria-labelledby', `experimental-overleaf-native-sidebar-tab-${panel.id}`);

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
            panelContainer.appendChild(panelRoot);
        }
        return panelRoot;
    }

    function renderPanelContent(panelContainer, panelDefinition) {
        const panelRoot = ensureCustomPanel(panelContainer, panelDefinition);
        if (!panelRoot) return;

        const title = panelRoot.querySelector('.experimental-overleaf-native-sidebar-title');
        const subtitle = panelRoot.querySelector('.experimental-overleaf-native-sidebar-subtitle');
        const body = panelRoot.querySelector('.experimental-overleaf-native-sidebar-body');
        const footer = panelRoot.querySelector(`.${FOOTER_CLASS}`);
        if (title) title.textContent = panelDefinition.title;
        if (subtitle) subtitle.textContent = panelDefinition.subtitle || '';
        if (body) body.textContent = '';
        state.footerText = '';
        panelDefinition.render(body, getPanelApi(panelDefinition.id));
        if (footer) footer.textContent = state.footerText;
        panelRoot.dataset.experimentalOverleafSidebarProjectId = getCurrentProjectIdOrEmpty();
        panelRoot.dataset.experimentalOverleafSidebarRenderVersion = String(state.renderVersions.get(panelDefinition.id) || 0);
    }

    function shouldRenderPanel(panelRoot, panelDefinition) {
        if (!panelRoot) return true;
        if (panelRoot.dataset.experimentalOverleafSidebarProjectId !== getCurrentProjectIdOrEmpty()) return true;
        const expected = String(state.renderVersions.get(panelDefinition.id) || 0);
        if (panelRoot.dataset.experimentalOverleafSidebarRenderVersion !== expected) return true;
        const body = panelRoot.querySelector('.experimental-overleaf-native-sidebar-body');
        return !body || !body.hasChildNodes();
    }

    // FIX 2: isSidebarClosed previously tested for a visible native tabContent,
    // but when a custom panel is active the native tabContent is hidden via
    // display:none !important — so the function always returned true while our
    // panel was open, causing ensureSidebarOpen to keep clicking the file-tree
    // button and destroying the custom panel's mode on every sync.
    //
    // The fix: if our own panel container is visible in the DOM, the rail is
    // clearly open and we should not attempt to re-open it.
    function isSidebarClosed(context) {
        // If our custom container is already visible, the sidebar is open.
        const panelContainer = document.getElementById(CONTAINER_ID);
        if (panelContainer && isVisible(panelContainer)) return false;

        const toggle = context.sidebarToggleButton;
        if (!toggle) return !context.tabContent;
        if (toggle.classList.contains('custom-toggler-closed')) return true;
        if (toggle.classList.contains('custom-toggler-open')) return false;
        if (toggle.getAttribute('aria-expanded') === 'false') return true;
        const label = toggle.getAttribute('aria-label') || '';
        if (/show the panel/i.test(label)) return true;

        // Fall back to checking whether the native tab content is in the DOM.
        // Note: when a custom panel is active, tabContent is hidden but still
        // connected, so we check isConnected rather than isVisible here.
        return !context.tabContent?.isConnected;
    }

    async function ensureSidebarOpen() {
        let context = resolveContext();
        if (!state.isOpen || !state.activeId) return context;
        if (!isSidebarClosed(context)) return context;

        if (context.sidebarToggleButton && isVisible(context.sidebarToggleButton)) {
            context.sidebarToggleButton.click();
            await wait(SIDEBAR_OPEN_DELAY_MS);
            context = resolveContext();
        }
        if (!isSidebarClosed(context)) return context;

        if (context.fileTreeButton && isVisible(context.fileTreeButton)) {
            context.fileTreeButton.click();
            await wait(SIDEBAR_OPEN_DELAY_MS);
            context = resolveContext();
        }
        if (!isSidebarClosed(context)) return context;

        const activeNativeTab = getActiveNativeTab(context.tabsWrapper);
        if (activeNativeTab && isVisible(activeNativeTab)) {
            activeNativeTab.click();
            await wait(SIDEBAR_OPEN_DELAY_MS);
            context = resolveContext();
        }
        return context;
    }

    function syncTabs(context) {
        const template = context.templateButton;
        if (!context.tabsWrapper || !template) return [];
        const buttons = [];
        [...state.panels.values()]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .forEach(panel => {
                let button = context.tabsWrapper.querySelector(`[${TAB_ATTR}="${panel.id}"]`);
                if (!button) {
                    button = createCustomTabButton(panel, template);
                    context.tabsWrapper.appendChild(button);
                }
                buttons.push(button);
            });
        return buttons;
    }

    function syncPanels(panelContainer) {
        if (!panelContainer) return [];
        return [...state.panels.values()]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(panel => ensureCustomPanel(panelContainer, panel))
            .filter(Boolean);
    }

    function updateSelectionState(context, customButtons, customPanels) {
        if (state.isOpen && state.activeId) {
            if (context.railContent) context.railContent.setAttribute(MODE_ATTR, 'custom');
            if (context.tabsWrapper) context.tabsWrapper.setAttribute(ACTIVE_TAB_ATTR, state.activeId);
            customButtons.forEach(button => {
                const isActive = button.dataset.panelId === state.activeId;
                button.classList.toggle('active', isActive);
                button.classList.toggle('open-rail', isActive);
                button.setAttribute('aria-selected', isActive ? 'true' : 'false');
                button.setAttribute('tabindex', isActive ? '0' : '-1');
            });
            customPanels.forEach(panel => {
                panel.classList.toggle('is-open', panel.getAttribute(TAB_ATTR) === state.activeId);
            });
            return;
        }
        if (context.railContent) context.railContent.removeAttribute(MODE_ATTR);
        if (context.tabsWrapper) context.tabsWrapper.removeAttribute(ACTIVE_TAB_ATTR);
        customButtons.forEach(button => {
            button.classList.remove('active', 'open-rail');
            button.setAttribute('aria-selected', 'false');
            button.setAttribute('tabindex', '-1');
        });
        customPanels.forEach(panel => {
            panel.classList.remove('is-open');
        });
    }

    async function sync() {
        const context = await ensureSidebarOpen();
        if (!context.tabsWrapper || !context.tabContent || !context.railContent) return;

        bindNativeTabHandlers(context);
        const panelContainer = ensurePanelContainer(context.railContent);
        if (!panelContainer) return;

        const buttons = syncTabs(context);
        const panels = syncPanels(panelContainer);

        const activePanel = state.isOpen && state.activeId ? state.panels.get(state.activeId) : null;
        if (activePanel) {
            const activePanelElement = panels.find(p => p.getAttribute(TAB_ATTR) === state.activeId)
                || ensureCustomPanel(panelContainer, activePanel);
            if (shouldRenderPanel(activePanelElement, activePanel)) {
                renderPanelContent(panelContainer, activePanel);
            }
        }

        updateSelectionState(context, buttons, panels);
        applyTheme(context, panelContainer, buttons);
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
