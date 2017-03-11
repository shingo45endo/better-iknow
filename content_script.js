(() => {
	'use strict';

	const script = document.createElement('script');
	script.charset='utf-8';
	script.src = chrome.extension.getURL('/embeded_script.js');
	document.getElementsByTagName('head')[0].appendChild(script);
})();
