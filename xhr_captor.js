(() => {
	'use strict';

	// Gets parameters from the content script via custom data attributes.
	const iframeParent = document.currentScript.dataset.iframeParent || 'body';
	const iframeId     = document.currentScript.dataset.iframeId     || '__xhr_captor__';
	const matchUrls    = document.currentScript.dataset.matchUrls    || '[".*"]';

	// Appends an iframe for messaging.
	const iframe = document.createElement('iframe');
	iframe.style.width   = '1px';
	iframe.style.height  = '1px';
	iframe.style.display = 'none';
	iframe.id = iframeId;
	document.querySelector(iframeParent).appendChild(iframe);

	let targetUrls = {};

	const isTargetUrl = (() => {
		const urls = JSON.parse(matchUrls);
		const matches = (Array.isArray(urls)) ? urls.map((url) => new RegExp(url)) : [/.*/];

		return (url) => matches.some((match) => match.test(url));
	})();

	((open) => {
		XMLHttpRequest.prototype.open = function(method, url, async) {
			// If the URL is a target of capturing, memorizes its URL.
			if (isTargetUrl(url)) {
				const canonicaliUrl = canonicalizeUtl(url);
				targetUrls[canonicaliUrl] = true;
			}

			// Calls the original function.
			open.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.open);

	((send) => {
		XMLHttpRequest.prototype.send = function(data) {
			// If the XHR is a target of capturing, sends its response to the content script via an iframe when the XHR succeeded.
			this.addEventListener('load', (event) => {
				const canonicaliUrl = canonicalizeUtl(this.responseURL);
				if (targetUrls[canonicaliUrl]) {
					iframe.contentWindow.postMessage(JSON.stringify({
						url:  canonicaliUrl,
						text: this.responseText,
					}), location.origin);
				}
			});

			// Calls the original function.
			send.apply(this, arguments);
		};
	})(XMLHttpRequest.prototype.send);

	function canonicalizeUtl(url) {
		return (url.indexOf('http') === 0) ? url : location.origin + url;
	}
})();
