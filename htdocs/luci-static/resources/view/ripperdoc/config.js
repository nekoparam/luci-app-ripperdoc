'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('ripperdoc'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['ripperdoc']['instances']['ripperdoc']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	var spanTemp = '<span style="color:%s"><strong>%s</strong></span>';
	var renderHTML;
	if (isRunning) {
		renderHTML = String.format(spanTemp, 'green', _('Running'));
	} else {
		renderHTML = String.format(spanTemp, 'red', _('Not running'));
	}
	return renderHTML;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('ripperdoc'),
			getServiceStatus()
		]);
	},

	render: function (data) {
		var isRunning = data[1];
		var m, s, o;

		m = new form.Map('ripperdoc', _('Ripperdoc'),
			_('Ripperdoc is an open-source, extensible AI coding agent that runs in your terminal. It supports Claude, OpenAI, DeepSeek and other LLM providers.'));

		// Status display
		s = m.section(form.TypedSection, '_status');
		s.anonymous = true;
		s.cfgsections = function () { return ['']; };
		s.render = function () {
			poll.add(function () {
				return getServiceStatus().then(function (res) {
					var view = document.getElementById('ripperdoc_status');
					if (view) {
						view.innerHTML = renderStatus(res);
					}
				});
			});
			return E('div', { class: 'cbi-section' }, [
				E('div', { id: 'ripperdoc_status' },
					renderStatus(isRunning))
			]);
		};

		// General Settings
		s = m.section(form.NamedSection, 'config', 'ripperdoc', _('General Settings'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable'),
			_('Enable or disable the Ripperdoc service.'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.ListValue, 'model', _('Model'),
			_('Select the AI model to use.'));
		o.value('claude-sonnet-4-20250514', 'Claude Sonnet 4');
		o.value('claude-opus-4-20250514', 'Claude Opus 4');
		o.value('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet');
		o.value('gpt-4o', 'GPT-4o');
		o.value('gpt-4o-mini', 'GPT-4o Mini');
		o.value('deepseek-chat', 'DeepSeek Chat');
		o.value('deepseek-coder', 'DeepSeek Coder');
		o.value('custom', _('Custom Model'));
		o.default = 'claude-sonnet-4-20250514';

		o = s.option(form.Value, 'custom_model', _('Custom Model Name'),
			_('Enter the model identifier when using a custom model.'));
		o.depends('model', 'custom');
		o.placeholder = 'model-name';

		o = s.option(form.Flag, 'safe_mode', _('Safe Mode'),
			_('When enabled, permission prompts are shown for sensitive operations. Disabling this is equivalent to --yolo mode.'));
		o.default = '1';

		o = s.option(form.Flag, 'verbose', _('Verbose Logging'),
			_('Enable detailed logging output.'));
		o.default = '0';

		o = s.option(form.Flag, 'mcp', _('MCP Integration'),
			_('Enable Model Context Protocol server integration.'));
		o.default = '1';

		o = s.option(form.Value, 'tools', _('Tools Filter'),
			_('Comma-separated list of tools to enable. Leave empty for all tools.'));
		o.placeholder = 'tool1,tool2,tool3';

		o = s.option(form.Value, 'workdir', _('Working Directory'),
			_('The working directory for Ripperdoc sessions.'));
		o.default = '/root';
		o.placeholder = '/root';

		o = s.option(form.Value, 'log_file', _('Log File'),
			_('Path to the log file.'));
		o.default = '/var/log/ripperdoc.log';
		o.placeholder = '/var/log/ripperdoc.log';

		// API Keys
		s = m.section(form.NamedSection, 'api_keys', 'api_keys', _('API Keys'),
			_('Configure API keys for various LLM providers. At least one API key is required.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'anthropic_api_key', _('Anthropic API Key'),
			_('API key for Claude models.'));
		o.password = true;
		o.placeholder = 'sk-ant-...';

		o = s.option(form.Value, 'openai_api_key', _('OpenAI API Key'),
			_('API key for GPT models.'));
		o.password = true;
		o.placeholder = 'sk-...';

		o = s.option(form.Value, 'deepseek_api_key', _('DeepSeek API Key'),
			_('API key for DeepSeek models.'));
		o.password = true;

		o = s.option(form.Value, 'kimi_api_key', _('Kimi API Key'),
			_('API key for Kimi models.'));
		o.password = true;

		o = s.option(form.Value, 'qwen_api_key', _('Qwen API Key'),
			_('API key for Qwen models.'));
		o.password = true;

		o = s.option(form.Value, 'glm_api_key', _('GLM API Key'),
			_('API key for GLM models.'));
		o.password = true;

		return m.render();
	}
});
