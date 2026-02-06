'use strict';
'require view';
'require dom';

var API_URL = '/cgi-bin/ripperdoc-api';

function apiCall(action, params) {
	var body = {};
	body.action = action;
	if (params) for (var k in params) body[k] = params[k];
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('POST', API_URL, true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.onload = function() {
			try { resolve(JSON.parse(xhr.responseText)); }
			catch(e) { reject(e); }
		};
		xhr.onerror = function() { reject(new Error('Network error')); };
		xhr.send(JSON.stringify(body));
	});
}

return view.extend({
	load: function() {
		return apiCall('get_config').catch(function() { return {}; });
	},

	render: function(cfg) {
		if (cfg.error) cfg = {};
		var profile = (cfg.model_profiles || {}).default || {};

		var style = E('style', {}, [
			'.rc-wrap{max-width:820px}',
			'.rc-section{background:#fff;border:1px solid #e2e5e9;border-radius:10px;padding:20px 24px;margin-bottom:16px}',
			'.rc-section h3{margin:0 0 16px;font-size:16px;font-weight:600;color:#1a1a2e;border-bottom:1px solid #eee;padding-bottom:8px}',
			'.rc-row{display:flex;align-items:center;margin-bottom:14px;gap:12px}',
			'.rc-label{width:150px;font-size:13px;font-weight:500;color:#555;flex-shrink:0;text-align:right}',
			'.rc-field{flex:1}',
			'.rc-field input,.rc-field select,.rc-field textarea{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;transition:border-color .15s}',
			'.rc-field input:focus,.rc-field select:focus,.rc-field textarea:focus{border-color:#5b4fcf}',
			'.rc-field input[type=number]{width:140px}',
			'.rc-hint{font-size:11px;color:#999;margin-top:3px}',
			'.rc-check{display:flex;align-items:center;gap:8px}',
			'.rc-check input[type=checkbox]{width:16px;height:16px;accent-color:#5b4fcf}',
			'.rc-check label{font-size:13px;color:#555}',
			'.rc-actions{display:flex;gap:10px;margin-top:20px;margin-bottom:20px}',
			'.rc-btn{padding:10px 28px;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}',
			'.rc-btn-primary{background:#5b4fcf;color:#fff}',
			'.rc-btn-primary:hover{background:#4a3fbf}',
			'.rc-btn-secondary{background:#e2e5e9;color:#333}',
			'.rc-btn-secondary:hover{background:#d0d3d8}',
			'.rc-toast{position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;opacity:0;transition:opacity .3s}',
			'.rc-toast.show{opacity:1}',
			'.rc-toast.ok{background:#4caf50}',
			'.rc-toast.err{background:#e53935}',
			'.rc-raw textarea{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:12px;min-height:320px;white-space:pre;tab-size:2;line-height:1.5}',
		].join('\n'));

		function inp(id, val, type, ph) {
			return E('input', {id: id, type: type||'text', value: val!=null?String(val):'', placeholder: ph||''});
		}
		function sel(id, val, opts) {
			var s = E('select', {id: id});
			opts.forEach(function(o) {
				s.appendChild(E('option', {value: o[0], selected: o[0]===val?'selected':null}, o[1]));
			});
			return s;
		}
		function chk(id, val, label) {
			return E('div', {class:'rc-check'}, [
				E('input', {id: id, type:'checkbox', checked: val?'checked':null}),
				E('label', {for: id}, label)
			]);
		}
		function row(label, field, hint) {
			return E('div', {class:'rc-row'}, [
				E('div', {class:'rc-label'}, label),
				E('div', {class:'rc-field'}, hint ? [field, E('div',{class:'rc-hint'},hint)] : [field])
			]);
		}

		var modelSection = E('div', {class:'rc-section'}, [
			E('h3', {}, 'Model Profile'),
			row('Provider', sel('f-provider', profile.provider||'anthropic', [
				['anthropic','Anthropic'],['openai','OpenAI'],['deepseek','DeepSeek'],
				['google','Google'],['custom','Custom']
			])),
			row('Model', inp('f-model', profile.model, 'text', 'glm-4.7')),
			row('API Key', inp('f-apikey', profile.api_key, 'password')),
			row('API Base URL', inp('f-apibase', profile.api_base, 'text', 'https://api.anthropic.com'), 'Custom endpoint. Leave empty for provider default.'),
			row('Max Tokens', inp('f-maxtokens', profile.max_tokens||4096, 'number')),
			row('Temperature', inp('f-temp', profile.temperature!=null?profile.temperature:0.7, 'number')),
		]);

		var generalSection = E('div', {class:'rc-section'}, [
			E('h3', {}, 'General'),
			row('Theme', sel('f-theme', cfg.theme||'dark', [['dark','Dark'],['light','Light']])),
			row('', chk('f-verbose', cfg.verbose, 'Verbose logging')),
			row('', chk('f-yolo', cfg.yolo_mode, 'YOLO mode (skip all permission prompts)')),
			row('', chk('f-thinking', cfg.show_full_thinking, 'Show full thinking')),
			row('', chk('f-compact', cfg.auto_compact_enabled!==false, 'Auto compact enabled')),
			row('Thinking Tokens', inp('f-thinktokens', cfg.default_thinking_tokens||10240, 'number')),
		]);

		var rawTa = E('textarea', {id:'f-raw'}, JSON.stringify(cfg, null, 2));
		var rawSection = E('div', {class:'rc-section'}, [
			E('h3', {}, 'Raw JSON'),
			E('div', {class:'rc-hint', style:'margin-bottom:10px'}, '/root/.ripperdoc.json'),
			E('div', {class:'rc-field rc-raw'}, [rawTa])
		]);

		var toast = E('div', {class:'rc-toast', id:'rc-toast'});
		function showToast(msg, ok) {
			toast.textContent = msg;
			toast.className = 'rc-toast show ' + (ok?'ok':'err');
			setTimeout(function(){ toast.className='rc-toast'; }, 3000);
		}

		function collectForm() {
			var c;
			try { c = JSON.parse(document.getElementById('f-raw').value); }
			catch(e) { c = JSON.parse(JSON.stringify(cfg)); }

			if (!c.model_profiles) c.model_profiles = {};
			if (!c.model_profiles.default) c.model_profiles.default = {};
			var p = c.model_profiles.default;
			p.provider = document.getElementById('f-provider').value;
			p.model = document.getElementById('f-model').value;
			var k = document.getElementById('f-apikey').value;
			if (k) p.api_key = k;
			p.api_base = document.getElementById('f-apibase').value || null;
			p.max_tokens = parseInt(document.getElementById('f-maxtokens').value) || 4096;
			p.temperature = parseFloat(document.getElementById('f-temp').value);
			if (isNaN(p.temperature)) p.temperature = 0.7;

			c.theme = document.getElementById('f-theme').value;
			c.verbose = document.getElementById('f-verbose').checked;
			c.yolo_mode = document.getElementById('f-yolo').checked;
			c.show_full_thinking = document.getElementById('f-thinking').checked;
			c.auto_compact_enabled = document.getElementById('f-compact').checked;
			c.default_thinking_tokens = parseInt(document.getElementById('f-thinktokens').value) || 10240;
			return c;
		}

		function saveForm() {
			var c = collectForm();
			document.getElementById('f-raw').value = JSON.stringify(c, null, 2);
			apiCall('save_config', {config: c}).then(function(r) {
				showToast(r && r.ok ? 'Saved' : 'Failed: '+(r.error||''), !!r.ok);
			}).catch(function(e) { showToast('Failed: '+e.message, false); });
		}

		function saveRaw() {
			var raw = document.getElementById('f-raw').value;
			try { var c = JSON.parse(raw); }
			catch(e) { showToast('Invalid JSON: '+e.message, false); return; }
			apiCall('save_config', {config: c}).then(function(r) {
				showToast(r && r.ok ? 'Saved' : 'Failed: '+(r.error||''), !!r.ok);
			}).catch(function(e) { showToast('Failed: '+e.message, false); });
		}

		return E('div', {class:'rc-wrap'}, [
			style, toast,
			E('h2', {style:'margin-bottom:4px'}, 'Ripperdoc Configuration'),
			E('p', {style:'color:#888;font-size:13px;margin:0 0 20px'}, '/root/.ripperdoc.json'),
			modelSection,
			generalSection,
			E('div', {class:'rc-actions'}, [
				E('button', {class:'rc-btn rc-btn-primary', click: saveForm}, 'Save'),
			]),
			rawSection,
			E('div', {class:'rc-actions'}, [
				E('button', {class:'rc-btn rc-btn-secondary', click: saveRaw}, 'Save Raw JSON'),
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
