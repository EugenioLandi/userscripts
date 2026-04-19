(function initExperimentalOverleafNativeSidebarHost(global) {
    'use strict';

    if (global.__experimentalOverleafNativeSidebarHost) return;

    const ACTIVE_KEY = 'experimental-overleaf-native-sidebar-active';
    const OPEN_KEY = 'experimental-overleaf-native-sidebar-open';
    const POSITION_KEY = 'experimental-overleaf-native-sidebar-position';
    const STYLE_ID = 'experimental-overleaf-native-sidebar-style';
    const WIDGET_ID = 'experimental-overleaf-native-sidebar-floating-widget';
    const TAB_ATTR = 'data-experimental-overleaf-native-tab';
    const FOOTER_CLASS = 'experimental-overleaf-native-sidebar-footer-slot';
    const NATIVE_TABS_WRAPPER_SELECTOR = '.ide-rail-tabs-wrapper';
    const NATIVE_TAB_CONTENT_SELECTOR = '.ide-rail-content .ide-rail-tab-content';
    const NATIVE_FILE_TREE_TAB_SELECTOR = '[data-rr-ui-event-key="file-tree"]';
    const DOM_SYNC_DEBOUNCE_MS = 150;
    const WIDGET_WIDTH = 360;
    const WIDGET_MIN_TOP = 72;
    const WIDGET_PADDING = 16;
    const EXCLUDED_BUTTON_CLASSES = [
        'd-flex',
        'flex-column',
        'align-items-center',
        'justify-content-center',
        'text-center',
        'p-0',
        'px-0',
        'py-0',
    ];

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
        const footer = document.querySelector(`#${WIDGET_ID} .${FOOTER_CLASS}`);
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

    function readWidgetPosition() {
        const stored = readJson(POSITION_KEY, null);
        if (!stored || typeof stored !== 'object') return null;
        if (!Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return null;
        return stored;
    }

    function writeWidgetPosition(position) {
        writeJson(POSITION_KEY, position);
    }

    function clampWidgetPosition(position) {
        const width = WIDGET_WIDTH;
        const xMax = Math.max(WIDGET_PADDING, global.innerWidth - width - WIDGET_PADDING);
        const yMax = Math.max(WIDGET_MIN_TOP, global.innerHeight - 140);
        return {
            x: Math.min(Math.max(WIDGET_PADDING, Math.round(position.x)), xMax),
            y: Math.min(Math.max(WIDGET_MIN_TOP, Math.round(position.y)), yMax),
        };
    }

    function getDefaultWidgetPosition() {
        return clampWidgetPosition({
            x: Math.round((global.innerWidth - WIDGET_WIDTH) / 2),
            y: 112,
        });
    }

    function applyWidgetPosition(widget, position, persist = true) {
        if (!widget) return;
        const next = clampWidgetPosition(position);
        widget.style.left = `${next.x}px`;
        widget.style.top = `${next.y}px`;
        if (persist) writeWidgetPosition(next);
    }

    function restoreWidgetPosition(widget) {
        applyWidgetPosition(widget, readWidgetPosition() || getDefaultWidgetPosition(), false);
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
        return { tabsWrapper, fileTreeButton, templateButton, tabContent };
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            [${TAB_ATTR}] {
                position: relative;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                align-self: center !important;
                margin-inline: auto;
                padding: 0 !important;
                box-sizing: border-box;
                transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
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

            #${WIDGET_ID} {
                position: fixed;
                z-index: 999999;
                display: none;
                flex-direction: column;
                width: min(${WIDGET_WIDTH}px, calc(100vw - ${WIDGET_PADDING * 2}px));
                max-width: calc(100vw - ${WIDGET_PADDING * 2}px);
                max-height: calc(100vh - ${WIDGET_MIN_TOP + WIDGET_PADDING}px);
                min-height: 200px;
                overflow: hidden;
                border: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
                border-radius: 14px;
                background: var(--ol-sidebar-bg, #fff);
                color: var(--ol-sidebar-fg, #1b2733);
                box-shadow: 0 22px 48px rgba(15, 23, 42, 0.22);
                backdrop-filter: blur(12px);
            }
            #${WIDGET_ID}.is-open {
                display: flex;
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 14px 16px;
                border-bottom: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
                cursor: grab;
                user-select: none;
                touch-action: none;
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-heading {
                min-width: 0;
                flex: 1 1 auto;
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-title {
                margin: 0;
                font-size: 0.9375rem;
                font-weight: 700;
                line-height: 1.35;
                color: inherit;
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-subtitle {
                margin: 3px 0 0;
                font-size: 0.75rem;
                line-height: 1.45;
                color: var(--ol-sidebar-muted, rgba(90, 100, 110, 0.88));
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-close {
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
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-close:hover {
                background: var(--ol-sidebar-hover, rgba(125, 125, 125, 0.1));
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-close:focus-visible {
                outline: 2px solid var(--ol-sidebar-focus, #1a73e8);
                outline-offset: 1px;
            }
            #${WIDGET_ID} .experimental-overleaf-native-sidebar-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow: auto;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                box-sizing: border-box;
            }
            #${WIDGET_ID} .${FOOTER_CLASS} {
                padding: 10px 16px 14px;
                border-top: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
                font-size: 0.6875rem;
                line-height: 1.45;
                color: var(--ol-sidebar-muted, rgba(90, 100, 110, 0.88));
                min-height: 14px;
            }
            #${WIDGET_ID} .ol-native-sidebar-card {
                border: 1px solid var(--ol-sidebar-border, rgba(125, 125, 125, 0.18));
                border-radius: 6px;
                padding: 10px 12px;
                background: var(--ol-sidebar-card-bg, rgba(255, 255, 255, 0.5));
                box-sizing: border-box;
            }
            #${WIDGET_ID} .ol-native-sidebar-muted {
                margin: 0;
                font-size: 0.8125rem;
                line-height: 1.5;
                color: var(--ol-sidebar-muted, rgba(90, 100, 110, 0.88));
            }
            #${WIDGET_ID} .ol-native-sidebar-input,
            #${WIDGET_ID} .ol-native-sidebar-textarea {
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
            #${WIDGET_ID} .ol-native-sidebar-input:focus,
            #${WIDGET_ID} .ol-native-sidebar-textarea:focus {
                border-color: var(--ol-sidebar-focus, #1a73e8);
                outline: none;
            }
            #${WIDGET_ID} .ol-native-sidebar-textarea {
                min-height: 200px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
                font-size: 0.75rem;
                line-height: 1.55;
            }
            #${WIDGET_ID} .ol-native-sidebar-button,
            #${WIDGET_ID} .ol-native-sidebar-link-button {
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
            #${WIDGET_ID} .ol-native-sidebar-button:hover,
            #${WIDGET_ID} .ol-native-sidebar-link-button:hover {
                background: var(--ol-sidebar-hover, rgba(125, 125, 125, 0.1));
            }
            #${WIDGET_ID} .ol-native-sidebar-button:focus-visible,
            #${WIDGET_ID} .ol-native-sidebar-link-button:focus-visible {
                outline: 2px solid var(--ol-sidebar-focus, #1a73e8);
                outline-offset: 1px;
            }
            #${WIDGET_ID} .ol-native-sidebar-list {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .overall-theme-dark #${WIDGET_ID},
            [data-theme="dark"] #${WIDGET_ID} {
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

    function createCustomTabButton(panel, templateButton) {
        const button = document.createElement('button');
        const nativeClasses = [...templateButton.classList].filter(cls => !EXCLUDED_BUTTON_CLASSES.includes(cls));
        button.className = nativeClasses.join(' ');
        button.setAttribute(TAB_ATTR, panel.id);
        button.dataset.panelId = panel.id;
        button.dataset.rrUiEventKey = panel.id;
        button.setAttribute('aria-label', panel.title);
        button.setAttribute('type', 'button');
        button.setAttribute('role', 'tab');
        button.id = `experimental-overleaf-native-sidebar-tab-${panel.id}`;
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

    function parseLuminance(colorString) {
        const match = colorString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!match) return 0.5;
        const [r, g, b] = [+match[1], +match[2], +match[3]];
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
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

    function applyTheme(context, widget, customButtons) {
        const colors = detectThemeColors(context);
        if (widget) {
            widget.style.setProperty('--ol-sidebar-bg', colors.bg);
            widget.style.setProperty('--ol-sidebar-fg', colors.fg);
            widget.style.setProperty('--ol-sidebar-border', colors.border);
            widget.style.setProperty('--ol-sidebar-muted', colors.muted);
            widget.style.setProperty('--ol-sidebar-hover', colors.hover);
            widget.style.setProperty('--ol-sidebar-button-bg', colors.buttonBg);
            widget.style.setProperty('--ol-sidebar-input-bg', colors.inputBg);
            widget.style.setProperty('--ol-sidebar-card-bg', colors.cardBg);
            widget.style.setProperty('--ol-sidebar-focus', colors.focus);
        }

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

    function ensureFloatingWidget() {
        let widget = document.getElementById(WIDGET_ID);
        if (widget) return widget;

        widget = document.createElement('section');
        widget.id = WIDGET_ID;
        widget.setAttribute('role', 'dialog');
        widget.setAttribute('aria-modal', 'false');

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
        close.setAttribute('aria-label', 'Close floating sidebar panel');
        close.textContent = '×';
        close.addEventListener('click', () => closePanel());

        header.append(heading, close);

        const body = document.createElement('div');
        body.className = 'experimental-overleaf-native-sidebar-body';
        const footer = document.createElement('div');
        footer.className = FOOTER_CLASS;
        widget.append(header, body, footer);
        document.body.appendChild(widget);
        restoreWidgetPosition(widget);
        makeDraggable(widget, header);
        return widget;
    }

    function makeDraggable(widget, handle) {
        let pointerId = null;
        let originX = 0;
        let originY = 0;
        let startX = 0;
        let startY = 0;

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            if (event.target instanceof Element && event.target.closest('button, input, textarea, select, a')) return;
            pointerId = event.pointerId;
            handle.setPointerCapture(pointerId);
            const rect = widget.getBoundingClientRect();
            originX = rect.left;
            originY = rect.top;
            startX = event.clientX;
            startY = event.clientY;
            handle.style.cursor = 'grabbing';
            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (event.pointerId !== pointerId) return;
            applyWidgetPosition(widget, {
                x: originX + event.clientX - startX,
                y: originY + event.clientY - startY,
            });
        });

        const release = event => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            handle.style.cursor = 'grab';
        };

        handle.addEventListener('pointerup', release);
        handle.addEventListener('pointercancel', release);
    }

    function getWidgetPanel(widget) {
        return widget?.dataset.panelId ? state.panels.get(widget.dataset.panelId) : null;
    }

    function renderPanelContent(widget, panelDefinition) {
        if (!widget || !panelDefinition) return;
        const title = widget.querySelector('.experimental-overleaf-native-sidebar-title');
        const subtitle = widget.querySelector('.experimental-overleaf-native-sidebar-subtitle');
        const body = widget.querySelector('.experimental-overleaf-native-sidebar-body');
        const footer = widget.querySelector(`.${FOOTER_CLASS}`);
        if (!body) return;

        widget.dataset.panelId = panelDefinition.id;
        widget.dataset.experimentalOverleafSidebarProjectId = getCurrentProjectIdOrEmpty();
        widget.dataset.experimentalOverleafSidebarRenderVersion = String(state.renderVersions.get(panelDefinition.id) || 0);
        widget.setAttribute('aria-labelledby', `experimental-overleaf-native-sidebar-tab-${panelDefinition.id}`);

        if (title) title.textContent = panelDefinition.title;
        if (subtitle) subtitle.textContent = panelDefinition.subtitle || '';
        body.textContent = '';
        state.footerText = '';
        panelDefinition.render(body, getPanelApi(panelDefinition.id));
        if (footer) footer.textContent = state.footerText;
    }

    function shouldRenderPanel(widget, panelDefinition) {
        if (!widget || !panelDefinition) return false;
        if (widget.dataset.panelId !== panelDefinition.id) return true;
        if (widget.dataset.experimentalOverleafSidebarProjectId !== getCurrentProjectIdOrEmpty()) return true;
        const expectedVersion = String(state.renderVersions.get(panelDefinition.id) || 0);
        if (widget.dataset.experimentalOverleafSidebarRenderVersion !== expectedVersion) return true;
        const body = widget.querySelector('.experimental-overleaf-native-sidebar-body');
        return !body || !body.hasChildNodes();
    }

    function syncTabs(context) {
        if (!context.tabsWrapper || !context.templateButton) return [];
        return [...state.panels.values()]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(panel => {
                let button = context.tabsWrapper.querySelector(`[${TAB_ATTR}="${panel.id}"]`);
                if (!button) {
                    button = createCustomTabButton(panel, context.templateButton);
                    context.tabsWrapper.appendChild(button);
                }
                return button;
            });
    }

    function updateSelectionState(customButtons, widget) {
        customButtons.forEach(button => {
            const isActive = state.isOpen && button.dataset.panelId === state.activeId;
            button.classList.toggle('active', isActive);
            button.classList.toggle('open-rail', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        if (!widget) return;
        widget.classList.toggle('is-open', Boolean(state.isOpen && state.activeId));
        widget.hidden = !(state.isOpen && state.activeId);
    }

    async function sync() {
        if (!document.body) {
            await wait(100);
            scheduleSync(0);
            return;
        }

        if (state.activeId && !state.panels.has(state.activeId)) {
            state.activeId = [...state.panels.keys()][0] || null;
            if (!state.activeId) state.isOpen = false;
            persistState();
        }

        const context = resolveContext();
        const buttons = syncTabs(context);
        const widget = ensureFloatingWidget();
        const activePanel = state.isOpen && state.activeId ? state.panels.get(state.activeId) : null;

        if (activePanel && shouldRenderPanel(widget, activePanel)) {
            renderPanelContent(widget, activePanel);
        }

        updateSelectionState(buttons, widget);
        applyTheme(context, widget, buttons);
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
        if (!state.activeId || !state.panels.has(state.activeId)) state.activeId = panel.id;
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
        global.addEventListener('resize', () => {
            const widget = document.getElementById(WIDGET_ID);
            if (widget) restoreWidgetPosition(widget);
        });
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
