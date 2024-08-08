(function ncs(window) {
  const getCookiePref = (cookiePrefsString) => {
    let cookiePrefsValueString;
    let match = document.cookie.match(new RegExp('(^| )' + (cookiePrefsString || 'cookie_prefs') + '=([^;]+)'));
    if (match) { cookiePrefsValueString = match[2]; }
    return cookiePrefsValueString
  }

  const getCookiePrefValue = (cookiePrefsString) => {
    const cookiePrefsValueString = getCookiePref(cookiePrefsString)
    cookiePrefsValue = cookiePrefsValueString &&
      decodeURIComponent(cookiePrefsValueString) &&
      decodeURIComponent(cookiePrefsValueString).split(',').reduce((acc, val) => {
        const [k, v] = val.split('=');
        if (k && v) { acc[k] = v; }
        return acc;
      }, {});
    return cookiePrefsValue;
  }

  const serverSideCookieFiltering = (cookieList, filterAPI) => {
    const xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');
    xhr.open('POST', filterAPI, true);
    const data = {
      cookieList,
    };
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "*/*");
    xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));
  }

  const clientCookieFiltering = (cookieList) => {
    let documentCookie = document.cookie && document.cookie.split(';');
    let clientCookie = documentCookie && documentCookie.map(nameValue => nameValue && nameValue.split('=')[0] && nameValue.split('=')[0].trim())
    let specialCookies = cookieList.filter(cookie => cookie.endsWith("*")).map(cookie => cookie.trim().substring(0, cookie.length - 1));
    let hostName = document.location.hostname;
    let subDomains = [hostName];
    for (var i = 0; i < hostName.length; i++) {
      if (hostName.charAt(i) == '.') {
        subDomains.push(hostName.substring(i));
      }
    }
    subDomains.pop();
    clientCookie && clientCookie.forEach(cookie => {
      if (cookieList.indexOf(cookie) < 0 && !(specialCookies.length > 0 && (specialCookies.some(scookie => cookie.startsWith(scookie))))) {
        document.cookie = cookie + `=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
        document.cookie = cookie + `=; ; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
        subDomains.forEach(domain => {
          document.cookie = cookie + `=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=${domain}`;
        })
      }
    })
  }
  const cookieFilter = (tenant, cookiePrefsString, cookiePrefsValue) => {
    try {
      if (!cookiePrefsValue) {
        cookiePrefsValue = getCookiePrefValue(cookiePrefsString);
      }
      let cookieMapping = document.createElement('script');
      cookieMapping.setAttribute('id', 'cookieMapping');
      cookieMapping.src = `https://www.paypalobjects.com/ncs/${tenant}/mapping.js`;
      document.head.appendChild(cookieMapping)
      cookieMapping.addEventListener('load', () => {
        let { essential, functional, marketing, performance, filterAPI, isClientCookies } = window.cookiemapping[tenant] || window.cookiemapping.default || {};

        if (isClientCookies || filterAPI) {
          let cookieList = [...essential];
          if (cookiePrefsValue && cookiePrefsValue.F === '1') {
            cookieList = [...cookieList, ...functional];
          }
          if (cookiePrefsValue && cookiePrefsValue.P === '1') {
            cookieList = [...cookieList, ...performance];
          }
          if (cookiePrefsValue && cookiePrefsValue.T === '1') {
            cookieList = [...cookieList, ...marketing];
          }

          if (isClientCookies && document.cookie) {
            clientCookieFiltering(cookieList);
          }

          if (filterAPI) {
            serverSideCookieFiltering(cookieList, filterAPI)
          }
        }
      })
    } catch (error) {
    }
  }

  function evaluate(value, tenant) {
    try {
      if (tenant === "paypal-eightfold") {
        return eval(value)
      }
    } catch (err) {
    }
    return value
  }

  function loadCookieBanner(policyData, policy, tenant, tenantData, nonce, isStandalone = false) {
    let language = evaluate(policyData.language, tenant),
      country = evaluate(policyData.country, tenant);
    if (!policyData || !country || !language) {
      return;
    }
    let cookiePrefsString = tenantData['cookiePrefsString'];
    let cookiePrefsValue = getCookiePrefValue(cookiePrefsString);
    const isExplicit = cookiePrefsValue && cookiePrefsValue.type && cookiePrefsValue.type.includes('explicit')

    if (policy == 'CookieBanner') {
      cookieFilter(tenant, cookiePrefsString, cookiePrefsValue);
      setTimeout(function () { cookieFilter(tenant, cookiePrefsString) }, 3000);
      if (isExplicit && tenant !== 'paypal') return true;
    }
    let originalHeaders = { cookie: '' };
    let cookiePrefsValueString = getCookiePref(cookiePrefsString);

    if (cookiePrefsValueString) {
      originalHeaders.cookie = `${tenantData['cookiePrefsString'] || 'cookie_prefs'}=${cookiePrefsValueString}`;
    }
    originalHeaders = JSON.stringify(originalHeaders);
    tenantData = JSON.stringify(tenantData)
    const inputObject = {
      "showBanner": true,
      "country": country,
      "language": language,
      "policyType": policy,
      "originalHeaders": originalHeaders,
      "tenant": tenant,
      "tenantData": tenantData
    }
    const requestURL = policyData.isProd === false ? (policyData.stageUrl || '') : 'https://www.paypal.com';

    let queryString = Object.keys(inputObject).map(function (key) {
      return key + '=' + inputObject[key];
    }).join('&');
    const xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');
    xhr.open('GET', `${requestURL}/myaccount/privacy/cookieprefs/getBanner?${queryString}`, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "*/*");
    xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
    xhr.onreadystatechange = function () {
      if (xhr.readyState > 3) {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.response);
          let { css, js, html, cookies } = response;
          if (css && js && html) {
            if (policy == 'Settings') {
              let settingsDiv = document.getElementById('settingsContent'),
                settingJs = document.createElement('script');
              settingsDiv.innerHTML = html + css;
              settingJs.setAttribute('id', 'settingsScript');
              settingJs.setAttribute('nonce', nonce);
              settingJs.innerHTML = js;
              document.body.appendChild(settingJs);
              if (!isStandalone) modalFocus()
            } else {
              let cookieBannerJs = document.createElement('script'),
                banner = document.createElement('div');
              cssElement = document.createElement('div');
              cssElement.innerHTML = css;
              banner.innerHTML = html;
              cookieBannerJs.setAttribute('id', 'bannerScript')
              cookieBannerJs.setAttribute('nonce', nonce)
              cookieBannerJs.innerHTML = js.replace(/(<([^>]+)>)/gi, "");
              document.body.appendChild(cssElement);
              document.body.appendChild(banner);
              document.body.appendChild(cookieBannerJs)
            }
          }
          if (cookies) {
            Object.keys(cookies).map(name => {
              const domain = cookies[name].options && cookies[name].options.domain;
              document.cookie = name + "=" + encodeURIComponent(cookies[name].value || "") + "; max-age=" + cookies[name].options.maxAge / 1000 + "; path=/; "
                + (domain ? "domain=" + domain : '');
            })
          }
        } else {
          if (policy == 'Settings' && document.getElementById('settingsContent')) {
            document.getElementById('settingsContent').innerHTML = "Please try again"
          }
        }
      }
    }
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(null));
    if (policy == 'Settings' && document.getElementById('settingsContent')) { document.getElementById('settingsContent').innerHTML = "Loading..." }
  }

  const triggerCookieFilter = () => {
    const { tenant, tenantData = {} } = getPolicyInfo();
    let cookiePrefsString = tenantData['cookiePrefsString'];
    cookieFilter(tenant, cookiePrefsString)
  }

  const getPolicyInfo = () => {
    const dataNode = document.getElementById('policy-data');
    return dataNode && dataNode.innerHTML ? JSON.parse(dataNode.innerHTML) : {}
  }

  function triggerncs() {
    const ncs = {
      "CookieBanner": loadCookieBanner,
      "Settings": manageCookieSettings
    }
    const policyInfo = getPolicyInfo();
    const { policies, poolicyData, tenant, tenantData = {}, policyData } = policyInfo;

    let { nonce } = policyInfo;
    nonce = (document.getElementById('policy-data') && document.getElementById('policy-data')['nonce']) || nonce;
    if (policies && policies.length > 0) {
      policies.forEach(policy => {
        const policyHandler = ncs[policy];
        if (policyHandler) {
          policyHandler(poolicyData || policyData, policy, tenant, tenantData, nonce);
        }
      });
    }
  }
  function manageCookieSettings() {
    document.addEventListener("DOMContentLoaded", function (event) {
      manageCookiePreferences(true);
    });
  }
  function manageCookiePreferences(isStandalone = false) {
    const dataNode = document.getElementById('policy-data'),
      policyInfo = dataNode && dataNode.innerHTML ? JSON.parse(dataNode.innerHTML) : {},
      { tenant, tenantData = {}, poolicyData } = policyInfo;
    let { nonce, policyData } = policyInfo;
    nonce = (document.getElementById('policy-data') && document.getElementById('policy-data')['nonce']) || nonce;
    policyData = policyData || poolicyData;
    let country = evaluate(policyData.country, tenant),
      language = evaluate(policyData.language, tenant);

    if (!policyData || !country || !language) {
      return false;
    }
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
      settingsModal.style.display = 'block';
      return false;
    }
    let settingDiv = document.createElement('div');
    settingDiv.setAttribute('id', 'settingsModal');
    let settingStyle = document.createElement('div');
    if (isStandalone) {
      let manageCookies = document.getElementById('manageCookies');
      if (!manageCookies) {
        manageCookies = document.createElement('div');
        manageCookies.setAttribute('id', 'manageCookies');
        document.body.appendChild(manageCookies);
      }
      settingDiv.innerHTML = (`<div id="settingsContent">Loading...</div>`);
      settingStyle.innerHTML = (`<style type="text/css">#settingsContent{width: 60%;margin: 0 auto;padding-top:15px;}
    .cookieAction{box-shadow: none;margin: 1em 0;}
    @media only screen and (max-width: 992px) {#settingsContent{width: 75%}}
    @media only screen and (max-width: 768px) {
      #settingsContent{width: 90%}      
    }</style>`)
      manageCookies.appendChild(settingDiv)
      manageCookies.appendChild(settingStyle)
    } else {
      settingDiv.innerHTML = (`<div class="settingsModalContent"><div class="settingsModal_header"><button id="settingsModalClose" aria-label="close" class="cookieBanner_close-button"/></div><div id="settingsContent">Loading...</div></div>`);
      settingStyle.innerHTML = (`<style type="text/css">#settingsModal{
        z-index: 9999;
        position: fixed;
        top:0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.1);
        -webkit-font-smoothing: antialiased;
        font-size: 16px;
      }
      .settingsModalContent{
        width: 50%;
        height: 100%;
        background-color: white;
        position: fixed;
        right: 25%;
        border: 1px solid lightgrey;
        overflow: scroll;
        padding: 0 2em 0 2em;
        box-sizing: border-box;
      }
      .settingsModal_header button.cookieBanner_close-button{
        position: relative;
        font-size: 1.5em;
        background: transparent;
        border: none;
        top: 0.66em;
        cursor: pointer;
        outline: none;
        padding: 0;
        width: 2em;
        height: 2em;
        float: right;
        right: -0.66em;
      }

    #settingsModalClose:focus{
        outline: 3px solid #0070BA;
    }
        
    .settingsModal_header button.cookieBanner_close-button::before{
      content: "\\2715";
    }
    .settingsModal_header{
      position: sticky;
      top: 0em;
      height: 4em;
      background: #FFFFFF;
    }
    @media only screen and (max-width: 1024px) {
        .settingsModalContent{
          width: 70%;
          right: 15%;
        }
      }
      @media only screen and (max-width: 768px) {
        .settingsModalContent{
          width: 100%;
          right: 0;
          padding: 0 1em 0 1em;
        }

        .settingsModal_header button.cookieBanner_close-button{
          right: 0;
        }
      }
    </style>`)
      document.body.appendChild(settingDiv);
      document.body.appendChild(settingStyle);
      if (document.getElementById('settingsModalClose')) {
        document.getElementById('settingsModalClose').onclick = function () {
          document.getElementById('settingsModal').style.display = 'none';
        }
      }
    }

    loadCookieBanner(policyData, 'Settings', tenant, tenantData, nonce, isStandalone)
    return false
  }
  const modalFocus = (element = document.getElementById('settingsModal'), prevFocusableElement = document.activeElement) => {
    const focusableEls = Array.from(
      element.querySelectorAll(
        'input[type="checkbox"],button'
      )
    );
    const firstFocusableEl = focusableEls[0];
    const lastFocusableEl = focusableEls[focusableEls.length - 1];
    let currentFocus = null;
    firstFocusableEl.focus();
    currentFocus = firstFocusableEl;
    document.addEventListener("focus", (e) => {
      e.preventDefault();
      if (focusableEls.includes(e.target)) {
        currentFocus = e.target;
        var cookieAction = document.querySelector('#submitCookiesBtn');
        if (cookieAction.getBoundingClientRect().top < document.activeElement.getBoundingClientRect().bottom) {
          document.activeElement.scrollIntoView({ block: 'center' });
        }
      } else {
        if (currentFocus === firstFocusableEl) {
          lastFocusableEl.focus();
        } else {
          firstFocusableEl.focus();
        }
        currentFocus = document.activeElement;
      }
    }, true);
  };
  triggerncs();
  window.triggerncs = triggerncs;
  window.cookieFilter = cookieFilter;
  window.triggerCookieFilter = triggerCookieFilter;
  window.manageCookiePreferences = manageCookiePreferences;
})(window);