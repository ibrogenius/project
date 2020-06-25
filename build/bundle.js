var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src\ProgressBar.svelte generated by Svelte v3.23.2 */

    function create_fragment(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let span;
    	let t0;
    	let t1;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			span = element("span");
    			t0 = text(/*progress*/ ctx[0]);
    			t1 = text("%");
    			attr(span, "class", "sr-only");
    			attr(div0, "class", "progress-bar svelte-pc874r");
    			set_style(div0, "width", /*progress*/ ctx[0] + "%");
    			attr(div1, "bp", "offset-5@md 4@md 12@sm");
    			attr(div1, "class", "progress-container svelte-pc874r");
    			attr(div2, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    			append(div0, span);
    			append(span, t0);
    			append(span, t1);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*progress*/ 1) set_data(t0, /*progress*/ ctx[0]);

    			if (dirty & /*progress*/ 1) {
    				set_style(div0, "width", /*progress*/ ctx[0] + "%");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { progress = 0 } = $$props;

    	$$self.$set = $$props => {
    		if ("progress" in $$props) $$invalidate(0, progress = $$props.progress);
    	};

    	return [progress];
    }

    class ProgressBar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { progress: 0 });
    	}
    }

    /* src\Timer.svelte generated by Svelte v3.23.2 */

    function create_fragment$1(ctx) {
    	let div0;
    	let h2;
    	let t0;
    	let t1;
    	let t2;
    	let p;
    	let t3;
    	let t4;
    	let progressbar;
    	let t5;
    	let div1;
    	let button;
    	let t6;
    	let current;
    	let mounted;
    	let dispose;
    	progressbar = new ProgressBar({ props: { progress: /*progress*/ ctx[2] } });

    	return {
    		c() {
    			div0 = element("div");
    			h2 = element("h2");
    			t0 = text("Seconds Left: ");
    			t1 = text(/*secondsLeft*/ ctx[0]);
    			t2 = space();
    			p = element("p");
    			t3 = text(/*progress*/ ctx[2]);
    			t4 = space();
    			create_component(progressbar.$$.fragment);
    			t5 = space();
    			div1 = element("div");
    			button = element("button");
    			t6 = text("Start");
    			attr(h2, "bp", "offset-5@md 4@md 12@sm");
    			attr(div0, "bp", "grid");
    			attr(p, "class", "skk");
    			attr(button, "bp", "offset-5@md 4@md 12@sm");
    			attr(button, "class", "start");
    			button.disabled = /*isRunning*/ ctx[1];
    			attr(div1, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, h2);
    			append(h2, t0);
    			append(h2, t1);
    			insert(target, t2, anchor);
    			insert(target, p, anchor);
    			append(p, t3);
    			insert(target, t4, anchor);
    			mount_component(progressbar, target, anchor);
    			insert(target, t5, anchor);
    			insert(target, div1, anchor);
    			append(div1, button);
    			append(button, t6);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*startTimer*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*secondsLeft*/ 1) set_data(t1, /*secondsLeft*/ ctx[0]);
    			if (!current || dirty & /*progress*/ 4) set_data(t3, /*progress*/ ctx[2]);
    			const progressbar_changes = {};
    			if (dirty & /*progress*/ 4) progressbar_changes.progress = /*progress*/ ctx[2];
    			progressbar.$set(progressbar_changes);

    			if (!current || dirty & /*isRunning*/ 2) {
    				button.disabled = /*isRunning*/ ctx[1];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(progressbar.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(progressbar.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p);
    			if (detaching) detach(t4);
    			destroy_component(progressbar, detaching);
    			if (detaching) detach(t5);
    			if (detaching) detach(div1);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    const setseconds = 5;

    function instance$1($$self, $$props, $$invalidate) {
    	let secondsLeft = setseconds;
    	let isRunning = false;

    	function startTimer() {
    		$$invalidate(1, isRunning = true);

    		const timer = setInterval(
    			() => {
    				$$invalidate(0, secondsLeft -= 1);

    				if (secondsLeft == 0) {
    					clearInterval(timer);
    					$$invalidate(1, isRunning = false);
    					$$invalidate(0, secondsLeft = setseconds);
    				}
    			},
    			1000
    		);
    	}

    	let progress;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*secondsLeft*/ 1) {
    			 $$invalidate(2, progress = (setseconds - secondsLeft) / setseconds * 100);
    		}
    	};

    	return [secondsLeft, isRunning, progress, startTimer];
    }

    class Timer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src\HowTo.svelte generated by Svelte v3.23.2 */

    function create_fragment$2(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<img bp="offset-5@md 4@md 12@sm" src="john.jpg" alt="HandWashing App" class="svelte-10t3lmq">`;
    			attr(div, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    class HowTo extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src\Quote.svelte generated by Svelte v3.23.2 */

    function create_fragment$3(ctx) {
    	let div0;
    	let t1;
    	let div1;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div0 = element("div");
    			div0.innerHTML = `<main bp="offset-5@md 4@md 12@sm"><p class="pa" id="johnny">...</p></main>`;
    			t1 = space();
    			div1 = element("div");
    			button = element("button");
    			button.textContent = "Black Lives Matter";
    			attr(div0, "bp", "grid");
    			attr(button, "bp", "offset-5@md 4@md 12@sm");
    			attr(button, "class", "blm svelte-7lqgpj");
    			attr(div1, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			append(div1, button);

    			if (!mounted) {
    				dispose = listen(button, "click", /*quote*/ ctx[0]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self) {
    	let quotes = [
    		"BLACKS ARE CRYING",
    		"BLACK LIVES MATTERS",
    		"STOP RAPING OUR WOMEN",
    		"WE ARE IMPORTANT",
    		"STOP RACISM",
    		"STOP TRIBALISM",
    		"STOP DISCRIMINATING"
    	];

    	let random;

    	function quote() {
    		random = Math.floor(Math.random() * quotes.length);
    		document.getElementById("johnny").innerHTML = quotes[random];
    	}

    	return [quote];
    }

    class Quote extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$3, safe_not_equal, {});
    	}
    }

    /* src\App.svelte generated by Svelte v3.23.2 */

    function create_fragment$4(ctx) {
    	let h1;
    	let t2;
    	let timer;
    	let t3;
    	let howto;
    	let t4;
    	let h3;
    	let t8;
    	let quote;
    	let current;
    	timer = new Timer({});
    	howto = new HowTo({});
    	quote = new Quote({});

    	return {
    		c() {
    			h1 = element("h1");

    			h1.innerHTML = `
  Inu John
  <small class="svelte-f0r2un"><a href="https://blacklivesmatter.com/" class="svelte-f0r2un">BLACK LIVES MATTER</a></small>`;

    			t2 = space();
    			create_component(timer.$$.fragment);
    			t3 = space();
    			create_component(howto.$$.fragment);
    			t4 = space();
    			h3 = element("h3");

    			h3.innerHTML = `<a href="https://www.who.int/gpsc/clean_hands_protection/en/" class="svelte-f0r2un">Picture Link</a> 
  <a href="https://freesound.org/people/metrostock99/sounds/345086" class="svelte-f0r2un">
    Sound Link
  </a>`;

    			t8 = space();
    			create_component(quote.$$.fragment);
    			attr(h1, "class", "svelte-f0r2un");
    			attr(h3, "class", "svelte svelte-f0r2un");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t2, anchor);
    			mount_component(timer, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(howto, target, anchor);
    			insert(target, t4, anchor);
    			insert(target, h3, anchor);
    			insert(target, t8, anchor);
    			mount_component(quote, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(timer.$$.fragment, local);
    			transition_in(howto.$$.fragment, local);
    			transition_in(quote.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(timer.$$.fragment, local);
    			transition_out(howto.$$.fragment, local);
    			transition_out(quote.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t2);
    			destroy_component(timer, detaching);
    			if (detaching) detach(t3);
    			destroy_component(howto, detaching);
    			if (detaching) detach(t4);
    			if (detaching) detach(h3);
    			if (detaching) detach(t8);
    			destroy_component(quote, detaching);
    		}
    	};
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$4, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.body,

    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
