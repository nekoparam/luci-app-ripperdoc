'use strict';
'require view';
'require poll';
'require fs';
'require ui';

return view.extend({
	load: function () {
		return Promise.all([
			L.resolveDefault(fs.read_direct('/var/log/ripperdoc.log'), '')
		]);
	},

	render: function (data) {
		var logdata = data[0] || _('No log data available.');

		var logTextarea = E('textarea', {
			id: 'syslog',
			style: 'font-size:12px; width:100%; min-height:500px; padding:8px; font-family:monospace; white-space:pre; overflow-x:auto;',
			readonly: 'readonly',
			wrap: 'off'
		}, [logdata]);

		poll.add(function () {
			return L.resolveDefault(fs.read_direct('/var/log/ripperdoc.log'), '').then(function (res) {
				var textarea = document.getElementById('syslog');
				if (textarea) {
					textarea.value = res || _('No log data available.');
					textarea.scrollTop = textarea.scrollHeight;
				}
			});
		});

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, [_('Ripperdoc Log')]),
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-section-descr' },
					_('The log is automatically refreshed every few seconds.')),
				logTextarea,
				E('div', { style: 'text-align:right; margin-top:10px;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-action',
						click: function () {
							var textarea = document.getElementById('syslog');
							if (textarea) {
								textarea.scrollTop = textarea.scrollHeight;
							}
						}
					}, [_('Scroll to bottom')]),
					'\u00a0',
					E('button', {
						class: 'btn cbi-button cbi-button-reset',
						click: function () {
							return fs.exec('/bin/sh', ['-c', '> /var/log/ripperdoc.log']).then(function () {
								var textarea = document.getElementById('syslog');
								if (textarea) {
									textarea.value = '';
								}
							});
						}
					}, [_('Clear log')])
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
