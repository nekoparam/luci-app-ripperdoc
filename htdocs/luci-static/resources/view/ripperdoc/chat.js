'use strict';
'require view';
'require poll';
'require dom';

var API_URL = '/cgi-bin/ripperdoc-api';
var currentSessionId = null;
var sessions = [];
var pollTimer = null;

function apiCall(action, params) {
	var body = JSON.assign({action: action}, params || {});
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('POST', API_URL, true);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.timeout = 120000;
		xhr.onload = function() {
			try { resolve(JSON.parse(xhr.responseText)); }
			catch(e) { reject(e); }
		};
		xhr.onerror = function() { reject(new Error('Network error')); };
		xhr.send(JSON.stringify(body));
	});
}

// Minimal markdown rendering
function renderMarkdown(text) {
	if (!text) return '';
	var html = text
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	// Code blocks
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
		return '<pre class="rd-code"><code>' + code.trim() + '</code></pre>';
	});
	// Inline code
	html = html.replace(/`([^`]+)`/g, '<code class="rd-inline-code">$1</code>');
	// Bold
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	// Italic
	html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
	// Line breaks
	html = html.replace(/\n/g, '<br>');
	return html;
}

function formatTime(ts) {
	if (!ts) return '';
	var d = new Date(ts * 1000);
	return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
}

function formatTimeAgo(ts) {
	if (!ts) return '';
	var now = Date.now() / 1000;
	var diff = now - ts;
	if (diff < 60) return 'just now';
	if (diff < 3600) return Math.floor(diff / 60) + ' mins ago';
	if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
	return Math.floor(diff / 86400) + ' days ago';
}

// JSON.assign polyfill-like helper
if (!JSON.assign) JSON.assign = function() {
	var result = {};
	for (var i = 0; i < arguments.length; i++) {
		var obj = arguments[i];
		if (obj) for (var k in obj) if (obj.hasOwnProperty(k)) result[k] = obj[k];
	}
	return result;
};

return view.extend({
	load: function() {
		return apiCall('list_sessions').then(function(res) {
			return Array.isArray(res) ? res : [];
		}).catch(function() { return []; });
	},

	render: function(data) {
		sessions = data || [];
		var self = this;

		// ---- CSS ----
		var style = E('style', {}, [
		'.rd-wrap{display:flex;height:calc(100vh - 120px);min-height:520px;border:1px solid #e2e5e9;border-radius:12px;overflow:hidden;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
		'.rd-side{width:280px;min-width:280px;background:#f8f9fb;border-right:1px solid #e2e5e9;display:flex;flex-direction:column}',
		'.rd-side-hdr{padding:20px 16px 12px;border-bottom:1px solid #e2e5e9}',
		'.rd-side-hdr h2{margin:0;font-size:18px;font-weight:700;color:#1a1a2e}',
		'.rd-side-hdr small{color:#888;font-size:12px}',
		'.rd-slist{flex:1;overflow-y:auto;padding:8px}',
		'.rd-sitem{display:flex;align-items:center;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:2px;transition:background .15s}',
		'.rd-sitem:hover{background:#eee}',
		'.rd-sitem.active{background:#e8e4f8}',
		'.rd-sitem-icon{width:20px;height:20px;margin-right:10px;color:#888;flex-shrink:0}',
		'.rd-sitem-body{flex:1;min-width:0}',
		'.rd-sitem-title{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333}',
		'.rd-sitem-meta{font-size:11px;color:#999;display:flex;align-items:center;gap:6px;margin-top:2px}',
		'.rd-sitem-count{margin-left:auto;background:#e2e5e9;border-radius:10px;padding:1px 7px;font-size:11px;color:#666;flex-shrink:0}',
		'.rd-sitem-del{opacity:0;margin-left:4px;color:#c00;cursor:pointer;font-size:16px;flex-shrink:0;padding:0 4px}',
		'.rd-sitem:hover .rd-sitem-del{opacity:.6}',
		'.rd-sitem-del:hover{opacity:1!important}',
		'.rd-newbtn{margin:8px;padding:10px;border:none;border-radius:8px;background:#5b4fcf;color:#fff;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s}',
		'.rd-newbtn:hover{background:#4a3fbf}',
		'.rd-main{flex:1;display:flex;flex-direction:column;min-width:0}',
		'.rd-hdr{padding:12px 20px;border-bottom:1px solid #e2e5e9;display:flex;align-items:center;justify-content:space-between}',
		'.rd-hdr-title{font-size:15px;font-weight:600;color:#1a1a2e}',
		'.rd-hdr-sub{font-size:11px;color:#999;margin-top:2px}',
		'.rd-tabs{display:flex;gap:4px}',
		'.rd-tab{padding:6px 14px;border:1px solid #e2e5e9;border-radius:6px;background:#fff;font-size:13px;cursor:pointer;color:#666;transition:all .15s}',
		'.rd-tab.active{background:#5b4fcf;color:#fff;border-color:#5b4fcf}',
		'.rd-msgs{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px}',
		'.rd-msg{display:flex;gap:10px;max-width:85%}',
		'.rd-msg.user{align-self:flex-end;flex-direction:row-reverse}',
		'.rd-msg.assistant{align-self:flex-start}',
		'.rd-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0}',
		'.rd-msg.user .rd-avatar{background:#5b4fcf;color:#fff}',
		'.rd-msg.assistant .rd-avatar{background:#e8e4f8;color:#5b4fcf}',
		'.rd-bubble{padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6;word-break:break-word}',
		'.rd-msg.user .rd-bubble{background:#5b4fcf;color:#fff;border-bottom-right-radius:4px}',
		'.rd-msg.assistant .rd-bubble{background:#f0f1f3;color:#1a1a2e;border-bottom-left-radius:4px}',
		'.rd-time{font-size:11px;color:#aaa;margin-top:4px}',
		'.rd-msg.user .rd-time{text-align:right}',
		'.rd-code{background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px;margin:6px 0}',
		'.rd-inline-code{background:#e8e4f8;padding:2px 6px;border-radius:4px;font-size:13px;color:#5b4fcf}',
		'.rd-msg.user .rd-inline-code{background:rgba(255,255,255,.2);color:#fff}',
		'.rd-thinking{display:flex;gap:4px;padding:8px 14px}',
		'.rd-thinking span{width:8px;height:8px;background:#5b4fcf;border-radius:50%;animation:rd-bounce .6s infinite alternate}',
		'.rd-thinking span:nth-child(2){animation-delay:.2s}',
		'.rd-thinking span:nth-child(3){animation-delay:.4s}',
		'@keyframes rd-bounce{to{opacity:.3;transform:translateY(-4px)}}',
		'.rd-input-wrap{padding:12px 20px;border-top:1px solid #e2e5e9;display:flex;align-items:flex-end;gap:10px;background:#fff}',
		'.rd-input{flex:1;border:1px solid #e2e5e9;border-radius:10px;padding:10px 14px;font-size:14px;resize:none;min-height:22px;max-height:160px;line-height:1.5;font-family:inherit;outline:none;transition:border-color .15s}',
		'.rd-input:focus{border-color:#5b4fcf}',
		'.rd-sendbtn{width:38px;height:38px;border:none;border-radius:50%;background:#5b4fcf;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}',
		'.rd-sendbtn:hover{background:#4a3fbf}',
		'.rd-sendbtn:disabled{background:#ccc;cursor:not-allowed}',
		'.rd-sendbtn svg{width:18px;height:18px}',
		'.rd-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#999}',
		'.rd-empty-icon{font-size:48px;margin-bottom:12px;opacity:.4}',
		'.rd-empty-text{font-size:15px}',
		'.rd-hint{font-size:12px;color:#aaa;text-align:center;padding:4px 0}',
		'.rd-tool{border:1px solid #4caf50;border-radius:8px;margin:6px 0;overflow:hidden}',
		'.rd-tool-hdr{background:#e8f5e9;padding:6px 10px;font-size:12px;font-weight:600;color:#2e7d32;cursor:pointer;display:flex;align-items:center;gap:6px}',
		'.rd-tool-body{padding:8px 10px;font-size:12px;display:none;background:#f1f8e9}',
		'.rd-tool.open .rd-tool-body{display:block}',
		].join('\n'));

		// ---- Sidebar ----
		var sessionList = E('div', {class: 'rd-slist', id: 'rd-slist'});
		var sidebar = E('div', {class: 'rd-side'}, [
			E('div', {class: 'rd-side-hdr'}, [
				E('h2', {}, 'Ripperdoc'),
				E('br'),
				E('small', {}, 'AI coding assistant')
			]),
			sessionList,
			E('button', {class: 'rd-newbtn', id: 'rd-newbtn'}, ['+\u00a0\u00a0New Session'])
		]);

		// ---- Main area ----
		var msgsContainer = E('div', {class: 'rd-msgs', id: 'rd-msgs'}, [
			E('div', {class: 'rd-empty'}, [
				E('div', {class: 'rd-empty-icon'}, '\u{1F916}'),
				E('div', {class: 'rd-empty-text'}, 'Start a new conversation')
			])
		]);

		var inputEl = E('textarea', {
			class: 'rd-input', id: 'rd-input', rows: 1,
			placeholder: 'Ask Ripperdoc to help with your code... (Enter to send)'
		});

		var sendBtn = E('button', {class: 'rd-sendbtn', id: 'rd-sendbtn'}, [
			E('svg', {viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'}, [
				E('path', {d: 'M22 2L11 13'}),
				E('path', {d: 'M22 2L15 22L11 13L2 9L22 2'})
			])
		]);

		var main = E('div', {class: 'rd-main'}, [
			E('div', {class: 'rd-hdr'}, [
				E('div', {}, [
					E('div', {class: 'rd-hdr-title', id: 'rd-hdr-title'}, 'New Session'),
					E('div', {class: 'rd-hdr-sub', id: 'rd-hdr-sub'}, '')
				]),
				E('div', {class: 'rd-tabs'}, [
					E('div', {class: 'rd-tab active'}, 'Chat'),
					E('div', {class: 'rd-tab'}, 'Shell'),
					E('div', {class: 'rd-tab'}, 'Files')
				])
			]),
			msgsContainer,
			E('div', {class: 'rd-input-wrap'}, [inputEl, sendBtn]),
			E('div', {class: 'rd-hint'}, 'Press Enter to send \u2022 Shift+Enter for new line')
		]);

		var container = E('div', {class: 'rd-wrap'}, [sidebar, main]);
		var root = E('div', {}, [style, container]);

		// ---- Logic ----
		function renderSessions() {
			var list = document.getElementById('rd-slist');
			if (!list) return;
			dom.content(list, []);
			sessions.forEach(function(s) {
				var item = E('div', {
					class: 'rd-sitem' + (s.id === currentSessionId ? ' active' : ''),
					'data-id': s.id,
					click: function() { loadSession(s.id); }
				}, [
					E('div', {class: 'rd-sitem-icon'}, '\u{1F4AC}'),
					E('div', {class: 'rd-sitem-body'}, [
						E('div', {class: 'rd-sitem-title'}, s.title || 'New Session'),
						E('div', {class: 'rd-sitem-meta'}, [
							'\u{1F551} ' + formatTimeAgo(s.created)
						])
					]),
					E('span', {class: 'rd-sitem-count'}, String(s.message_count || 0)),
					E('span', {class: 'rd-sitem-del', click: function(ev) {
						ev.stopPropagation();
						deleteSession(s.id);
					}}, '\u00d7')
				]);
				list.appendChild(item);
			});
		}

		function renderMessages(msgs, working) {
			var c = document.getElementById('rd-msgs');
			if (!c) return;
			dom.content(c, []);
			if (!msgs || msgs.length === 0) {
				c.appendChild(E('div', {class: 'rd-empty'}, [
					E('div', {class: 'rd-empty-icon'}, '\u{1F916}'),
					E('div', {class: 'rd-empty-text'}, 'Start a conversation')
				]));
				return;
			}
			msgs.forEach(function(m) {
				var isUser = m.role === 'user';
				var bubble = E('div', {class: 'rd-bubble'});
				bubble.innerHTML = isUser ? (m.content||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>') : renderMarkdown(m.content);
				var msg = E('div', {class: 'rd-msg ' + m.role}, [
					E('div', {class: 'rd-avatar'}, isUser ? 'U' : 'R'),
					E('div', {}, [
						bubble,
						E('div', {class: 'rd-time'}, formatTime(m.timestamp))
					])
				]);
				c.appendChild(msg);
			});
			if (working) {
				c.appendChild(E('div', {class: 'rd-msg assistant'}, [
					E('div', {class: 'rd-avatar'}, 'R'),
					E('div', {class: 'rd-thinking'}, [
						E('span'), E('span'), E('span')
					])
				]));
			}
			c.scrollTop = c.scrollHeight;
		}

		function loadSession(sid) {
			currentSessionId = sid;
			renderSessions();
			apiCall('get_session', {session_id: sid}).then(function(s) {
				if (!s || s.error) return;
				var title = document.getElementById('rd-hdr-title');
				var sub = document.getElementById('rd-hdr-sub');
				if (title) title.textContent = s.title || 'New Session';
				if (sub) sub.textContent = s.id;
				renderMessages(s.messages, s.working);
				if (s.working) startPolling(sid);
				else stopPolling();
			});
		}

		function createSession() {
			apiCall('new_session').then(function(s) {
				if (!s || s.error) return;
				sessions.unshift({id: s.id, title: s.title, created: s.created, message_count: 0});
				currentSessionId = s.id;
				renderSessions();
				var title = document.getElementById('rd-hdr-title');
				var sub = document.getElementById('rd-hdr-sub');
				if (title) title.textContent = 'New Session';
				if (sub) sub.textContent = s.id;
				renderMessages([], false);
				var inp = document.getElementById('rd-input');
				if (inp) inp.focus();
			});
		}

		function deleteSession(sid) {
			apiCall('delete_session', {session_id: sid}).then(function() {
				sessions = sessions.filter(function(s) { return s.id !== sid; });
				if (currentSessionId === sid) {
					currentSessionId = null;
					if (sessions.length > 0) loadSession(sessions[0].id);
					else {
						renderSessions();
						renderMessages([], false);
						var title = document.getElementById('rd-hdr-title');
						if (title) title.textContent = 'New Session';
					}
				} else {
					renderSessions();
				}
			});
		}

		function sendMessage() {
			var inp = document.getElementById('rd-input');
			if (!inp) return;
			var text = inp.value.trim();
			if (!text) return;
			if (!currentSessionId) {
				apiCall('new_session').then(function(s) {
					sessions.unshift({id: s.id, title: 'New Session', created: s.created, message_count: 0});
					currentSessionId = s.id;
					renderSessions();
					doSend(text);
				});
			} else {
				doSend(text);
			}
			inp.value = '';
			inp.style.height = 'auto';
		}

		function doSend(text) {
			var btn = document.getElementById('rd-sendbtn');
			if (btn) btn.disabled = true;
			apiCall('send_message', {session_id: currentSessionId, content: text}).then(function(s) {
				if (!s || s.error) {
					if (btn) btn.disabled = false;
					return;
				}
				// Update session title in sidebar
				for (var i = 0; i < sessions.length; i++) {
					if (sessions[i].id === currentSessionId) {
						sessions[i].title = s.title;
						sessions[i].message_count = (s.messages||[]).length;
						break;
					}
				}
				renderSessions();
				renderMessages(s.messages, s.working);
				if (s.working) startPolling(currentSessionId);
			});
		}

		function startPolling(sid) {
			stopPolling();
			pollTimer = setInterval(function() {
				apiCall('get_session', {session_id: sid}).then(function(s) {
					if (!s || s.error) return;
					if (s.id !== currentSessionId) return;
					renderMessages(s.messages, s.working);
					// Update sidebar count
					for (var i = 0; i < sessions.length; i++) {
						if (sessions[i].id === sid) {
							sessions[i].message_count = (s.messages||[]).length;
							sessions[i].title = s.title;
							break;
						}
					}
					renderSessions();
					if (!s.working) {
						stopPolling();
						var btn = document.getElementById('rd-sendbtn');
						if (btn) btn.disabled = false;
					}
				});
			}, 2000);
		}

		function stopPolling() {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		}

		// ---- Event bindings (deferred) ----
		requestAnimationFrame(function() {
			var newBtn = document.getElementById('rd-newbtn');
			if (newBtn) newBtn.addEventListener('click', createSession);

			var sendBtnEl = document.getElementById('rd-sendbtn');
			if (sendBtnEl) sendBtnEl.addEventListener('click', sendMessage);

			var inputField = document.getElementById('rd-input');
			if (inputField) {
				inputField.addEventListener('keydown', function(ev) {
					if (ev.key === 'Enter' && !ev.shiftKey) {
						ev.preventDefault();
						sendMessage();
					}
				});
				inputField.addEventListener('input', function() {
					this.style.height = 'auto';
					this.style.height = Math.min(this.scrollHeight, 160) + 'px';
				});
			}

			// Initial load
			renderSessions();
			if (sessions.length > 0) {
				loadSession(sessions[0].id);
			}
		});

		return root;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
