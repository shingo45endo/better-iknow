(() => {
	'use strict';

	// Gets parameters from the content script via custom data attributes.
	const {matchUrls, iframeId} = document.currentScript.dataset;
	if (!iframeId) {
		throw new Error('Invalid data attributes');
	}

	// Gets the iframe for messaging.
	const iframe = document.getElementById(iframeId);
	if (!iframe) {
		throw new Error('iframe not found');
	}

	const targetUrls = {};

	const isTargetUrl = (() => {
		const urls = JSON.parse(matchUrls || '[".*"]');
		const matches = (Array.isArray(urls)) ? urls.map((url) => new RegExp(url)) : [/.*/];

		return (url) => matches.some((match) => match.test(url));
	})();

	((open) => {
		XMLHttpRequest.prototype.open = function(...args) {
			const [method, url] = args;

			// If the URL is a target of capturing, memorizes its URL.
			if (isTargetUrl(url)) {
				targetUrls[canonicalizeUrl(url)] = true;
			}

			// Calls the original function.
			open.apply(this, args);
		};
	})(XMLHttpRequest.prototype.open);

	((send) => {
		XMLHttpRequest.prototype.send = function(...args) {
			const [data] = args;

			// If the XHR is a target of capturing, sends its response to the content script via an iframe when the XHR succeeded.
			this.addEventListener('load', () => {
				const canonicalUrl = canonicalizeUrl(this.responseURL);
				if (targetUrls[canonicalUrl]) {
					iframe.contentWindow.postMessage(JSON.stringify({
						url:  canonicalUrl,
						text: this.responseText,
					}), location.origin);
				}
			});

			// Calls the original function.
			send.apply(this, args);
		};
	})(XMLHttpRequest.prototype.send);

	function canonicalizeUrl(url) {
		return (url.indexOf('http') === 0) ? url : location.origin + url;
	}
})();
