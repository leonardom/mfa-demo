/* ============== STATE ============== */
const users = {
  user1: {
    username: "user1",
    password: "password123",
    mfa: {
      recoveryCodes: [],
      passkey: false,
      authenticatorApp: false,
      sms: null,
      primary: null,
    },
  },
  user2: {
    username: "user2",
    password: "password123",
    mfa: {
      recoveryCodes: [],
      passkey: false,
      authenticatorApp: false,
      sms: null,
      primary: null,
    },
  },
  user3: {
    username: "user3",
    password: "password123",
    mfa: {
      recoveryCodes: [],
      passkey: false,
      authenticatorApp: false,
      sms: null,
      primary: null,
    },
  },
};

const session = {
  currentUser: null,
  pendingMfaUser: null,
  view: "home",
  flash: null,
  dropdownOpen: false,
  profileMethodOpen: null,
};

let flashTimer = null;

/* ============== HELPERS ============== */
function flash(type, msg, opts = {}) {
  const { rerender = true } = opts;
  session.flash = { type, msg };
  if (flashTimer) clearTimeout(flashTimer);
  if (rerender) render();
  else renderFlash();
  flashTimer = setTimeout(() => {
    if (session.flash && session.flash.msg === msg) {
      session.flash = null;
      renderFlash();
    }
  }, 4000);
}

function renderFlash() {
  const flashMount = document.getElementById("flashMount");
  if (!flashMount) return;

  if (!session.flash) {
    flashMount.innerHTML = "";
    return;
  }

  flashMount.innerHTML = `<div class="container container-flush-bottom"><div class="flash flash-${session.flash.type}">${session.flash.msg}</div></div>`;
}

function genCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function hasAnyMfa(u) {
  return (
    u.mfa.passkey ||
    u.mfa.authenticatorApp ||
    u.mfa.sms ||
    u.mfa.recoveryCodes.length > 0
  );
}

/* ============== TOP BAR ============== */
function renderTopbar() {
  const el = document.getElementById("topbarActions");
  if (session.currentUser) {
    const u = users[session.currentUser];
    const initial = u.username.charAt(0).toUpperCase();
    el.innerHTML = `
      <div class="user-chip" id="userChip">
        <span class="avatar">${initial}</span>
        <span class="user-name">${u.username}</span>
      </div>
    `;
    document.getElementById("userChip").onclick = (e) => {
      e.stopPropagation();
      session.dropdownOpen = !session.dropdownOpen;
      render();
    };
    if (session.dropdownOpen) {
      const dd = document.createElement("div");
      dd.className = "dropdown";
      dd.innerHTML = `
        <div class="dropdown-header">Signed in as <strong>${u.username}</strong></div>
        <div class="dropdown-divider"></div>
        <button id="ddProfile">Your profile & MFA</button>
        <div class="dropdown-divider"></div>
        <button id="ddLogout" class="dropdown-signout">Sign out</button>
      `;
      document.body.appendChild(dd);
      dd.onclick = (e) => e.stopPropagation();
      document.getElementById("ddProfile").onclick = () => {
        session.dropdownOpen = false;
        session.view = "profile";
        render();
      };
      document.getElementById("ddLogout").onclick = () => {
        session.currentUser = null;
        session.dropdownOpen = false;
        session.view = "home";
        flash("success", "Signed out");
      };
    }
  } else {
    el.innerHTML = `
      <button class="btn" id="navSignin">Sign in</button>
      <button class="btn btn-primary" id="navSignup">Sign up</button>
    `;
    document.getElementById("navSignin").onclick = () => {
      session.view = "login";
      render();
    };
    document.getElementById("navSignup").onclick = () => {
      session.view = "signup";
      render();
    };
  }
  document.getElementById("brandBtn").onclick = () => {
    session.view = session.currentUser ? "profile" : "home";
    render();
  };
}

/* ============== VIEWS ============== */
function renderHome() {
  return `
    <div class="container">
      <div class="hero">
        <h1>Welcome to MFA Demo</h1>
        <p>A frontend-only demonstration of multi-factor authentication flows: passkeys, authenticator apps, SMS, and recovery codes.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" id="heroSignin">Sign in</button>
          <button class="btn btn-lg" id="heroSignup">Create account</button>
        </div>
        <p class="hero-demo">
          Demo accounts: <code class="inline-code-pill">user1</code> /
          <code class="inline-code-pill">user2</code> /
          <code class="inline-code-pill">user3</code> · password: <code class="inline-code-pill">password123</code>
        </p>
      </div>
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="container">
      <div class="card auth-card">
        <div class="card-body">
          <h2 class="center-title">Sign in</h2>
          <div class="field"><label>Username</label><input id="liUser" autocomplete="username" /></div>
          <div class="field"><label>Password</label><input id="liPass" type="password" autocomplete="current-password" /></div>
          <button class="btn btn-primary btn-block" id="liSubmit">Sign in</button>
          <p class="auth-switch-text">
            No account? <button class="link" id="goSignup">Create one</button>
          </p>
        </div>
      </div>
    </div>
  `;
}

function renderSignup() {
  return `
    <div class="container">
      <div class="card auth-card">
        <div class="card-body">
          <h2 class="center-title">Create account</h2>
          <div class="field"><label>Username</label><input id="suUser" /></div>
          <div class="field"><label>Password</label><input id="suPass" type="password" /></div>
          <button class="btn btn-primary btn-block" id="suSubmit">Create account</button>
          <p class="auth-switch-text">
            Already have one? <button class="link" id="goSignin">Sign in</button>
          </p>
        </div>
      </div>
    </div>
  `;
}

function renderMfaChallenge() {
  const u = users[session.pendingMfaUser];
  const methods = [];
  if (u.mfa.passkey) methods.push({ id: "passkey", label: "Passkey" });
  if (u.mfa.authenticatorApp)
    methods.push({ id: "authenticatorApp", label: "Authenticator app" });
  if (u.mfa.sms) methods.push({ id: "sms", label: `SMS (${u.mfa.sms})` });
  if (u.mfa.recoveryCodes.length > 0)
    methods.push({ id: "recovery", label: "Recovery code" });

  const primary =
    u.mfa.primary && methods.find((m) => m.id === u.mfa.primary)
      ? u.mfa.primary
      : methods[0]?.id;

  return `
    <div class="container">
      <div class="card auth-card">
        <div class="card-body">
          <h2 class="center-title">Two-factor authentication</h2>
          <p class="mfa-subtitle">Verify your identity to continue as <strong>${u.username}</strong>.</p>
          <div class="field mfa-method-field">
            <label>Method</label>
            <select id="mfaMethod" class="input-select">
              ${methods.map((m) => `<option value="${m.id}" ${m.id === primary ? "selected" : ""}>${m.label}${m.id === u.mfa.primary ? " (primary)" : ""}</option>`).join("")}
            </select>
          </div>
          <div id="mfaInputArea"></div>
          <button class="btn btn-primary btn-block mt-8" id="mfaVerify">Verify</button>
          <p class="center mt-14"><button class="link" id="mfaCancel">Cancel</button></p>
        </div>
      </div>
    </div>
  `;
}

function renderProfile() {
  const u = users[session.currentUser];
  const m = u.mfa;

  function renderMethodSetupPanel(id) {
    if (id === "passkey") {
      return `
        <div class="mfa-setup-card">
          <p class="panel-desc">Register a passkey on this device. (Demo: simulated WebAuthn.)</p>
          <button class="btn btn-primary" id="pkReg">${u.mfa.passkey ? "Re-register passkey" : "Register passkey"}</button>
        </div>
      `;
    }

    if (id === "authenticatorApp") {
      return `
        <div class="mfa-setup-card">
          <p class="panel-desc">Scan the QR code in your authenticator app. (Demo: enter <code>123456</code>.)</p>
          <div class="qr-placeholder">[QR CODE]</div>
          <div class="field"><label>Verification code</label><input id="aaCode" maxlength="6" placeholder="000000" /></div>
          <button class="btn btn-primary" id="aaVerify">Verify & enable</button>
        </div>
      `;
    }

    if (id === "sms") {
      return `
        <div class="mfa-setup-card">
          <p class="panel-desc">Enter your phone number to receive codes. (Demo: any number works; verification code is <code>654321</code>.)</p>
          <div class="field"><label>Phone number</label><input id="smsPhone" placeholder="+1 555 123 4567" value="${u.mfa.sms || ""}" /></div>
          <div class="field"><label>Verification code</label><input id="smsCode" maxlength="6" placeholder="000000" /></div>
          <button class="btn btn-primary" id="smsVerify">Verify & enable</button>
        </div>
      `;
    }

    return `
      <div class="mfa-setup-card">
        <p class="panel-desc">Generate a fresh set of one-time recovery codes. Save them somewhere safe - each can only be used once.</p>
        ${u.mfa.recoveryCodes.length > 0 ? `<div class="codes-grid">${u.mfa.recoveryCodes.map((c) => `<div>${c}</div>`).join("")}</div>` : ""}
        <button class="btn btn-primary" id="rcGen">${u.mfa.recoveryCodes.length > 0 ? "Regenerate codes" : "Generate codes"}</button>
      </div>
    `;
  }

  const methodCard = (opts) => `
    <div class="mfa-method">
      <div class="mfa-icon">${opts.icon}</div>
      <div class="mfa-info">
        <div class="mfa-title-row">
          <span class="mfa-title">${opts.title}</span>
          ${opts.configured ? '<span class="badge badge-success">Configured</span>' : ""}
          ${opts.isPrimary ? '<span class="badge badge-primary">Primary</span>' : ""}
          ${opts.warn ? `<span class="badge badge-warn">${opts.warn}</span>` : ""}
        </div>
        <div class="mfa-desc">${opts.desc}</div>
      </div>
      <div class="mfa-actions">
        ${opts.configured && !opts.isPrimary && opts.canBePrimary ? `<button class="btn" data-primary="${opts.id}">Set primary</button>` : ""}
        ${opts.configured ? `<button class="btn btn-danger" data-remove="${opts.id}">Remove</button>` : ""}
        <button class="btn ${opts.configured ? "" : "btn-primary"}" data-action="${opts.id}">${opts.configured ? "Edit" : "Add"}</button>
      </div>
      ${session.profileMethodOpen === opts.id ? `<div class="mfa-method-detail">${renderMethodSetupPanel(opts.id)}</div>` : ""}
    </div>
  `;

  return `
    <div class="container">
      <div class="profile-heading">
        <h1 class="profile-title">Account · ${u.username}</h1>
        <p class="profile-subtitle">Manage your two-factor authentication methods.</p>
      </div>

      <div class="card card-mb-20">
        <div class="card-header">Two-factor methods</div>
        <div>
          ${methodCard({
            id: "passkey",
            icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/></svg>',
            title: "Passkey",
            desc: "Use a passkey (Face ID, Touch ID, or security key) for phishing-resistant sign-in.",
            configured: m.passkey,
            isPrimary: m.primary === "passkey",
            canBePrimary: true,
          })}
          ${methodCard({
            id: "authenticatorApp",
            icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',
            title: "Authenticator app",
            desc: "Use an authenticator app to get one-time codes when prompted.",
            configured: m.authenticatorApp,
            isPrimary: m.primary === "authenticatorApp",
            canBePrimary: true,
          })}
          ${methodCard({
            id: "sms",
            icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            title: "SMS / Text message",
            desc: m.sms
              ? `Codes sent to ${m.sms}. Less secure than other methods.`
              : "Get one-time codes via SMS. Less secure — use only as a fallback.",
            configured: !!m.sms,
            isPrimary: m.primary === "sms",
            canBePrimary: true,
            warn: "Less secure",
          })}
          ${methodCard({
            id: "recovery",
            icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15v2m0 0v2m0-2h2m-2 0h-2"/><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
            title: "Recovery codes",
            desc:
              m.recoveryCodes.length > 0
                ? `${m.recoveryCodes.length} unused recovery code(s) remaining. Use only when other methods are unavailable.`
                : "Generate one-time codes to use if you lose access to your other methods.",
            configured: m.recoveryCodes.length > 0,
            isPrimary: false,
            canBePrimary: false,
          })}
        </div>
      </div>
    </div>
  `;
}

/* ============== ACTION HANDLERS ============== */
function bindHome() {
  document.getElementById("heroSignin").onclick = () => {
    session.view = "login";
    render();
  };
  document.getElementById("heroSignup").onclick = () => {
    session.view = "signup";
    render();
  };
}

function bindLogin() {
  const submit = () => {
    const username = document.getElementById("liUser").value.trim();
    const password = document.getElementById("liPass").value;
    const u = users[username];
    if (!u || u.password !== password) {
      flash("error", "Invalid username or password");
      return;
    }
    if (hasAnyMfa(u)) {
      session.pendingMfaUser = username;
      session.view = "mfa";
      render();
    } else {
      session.currentUser = username;
      session.view = "profile";
      flash("success", `Welcome, ${username}!`);
    }
  };
  document.getElementById("liSubmit").onclick = submit;
  ["liUser", "liPass"].forEach((id) =>
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    }),
  );
  document.getElementById("goSignup").onclick = () => {
    session.view = "signup";
    render();
  };
}

function bindSignup() {
  const submit = () => {
    const username = document.getElementById("suUser").value.trim();
    const password = document.getElementById("suPass").value;
    if (!username || !password) {
      flash("error", "Username and password required");
      return;
    }
    if (users[username]) {
      flash("error", "Username already taken");
      return;
    }
    users[username] = {
      username,
      password,
      mfa: {
        recoveryCodes: [],
        passkey: false,
        authenticatorApp: false,
        sms: null,
        primary: null,
      },
    };
    session.currentUser = username;
    session.view = "profile";
    flash("success", `Account created. Welcome, ${username}!`);
  };
  document.getElementById("suSubmit").onclick = submit;
  ["suUser", "suPass"].forEach((id) =>
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    }),
  );
  document.getElementById("goSignin").onclick = () => {
    session.view = "login";
    render();
  };
}

function bindMfa() {
  const u = users[session.pendingMfaUser];
  const sel = document.getElementById("mfaMethod");
  const area = document.getElementById("mfaInputArea");

  function updateInput() {
    const m = sel.value;
    if (m === "passkey")
      area.innerHTML = `<p class="hint-text">Click Verify to authenticate with your passkey.</p>`;
    else if (m === "authenticatorApp")
      area.innerHTML = `<div class="field"><label>6-digit code</label><input id="mfaCode" maxlength="6" placeholder="000000" /></div><p class="hint-subtle">Demo: enter <code>123456</code></p>`;
    else if (m === "sms")
      area.innerHTML = `<div class="field"><label>SMS code sent to ${u.mfa.sms}</label><input id="mfaCode" maxlength="6" placeholder="000000" /></div><p class="hint-subtle">Demo: enter <code>654321</code></p>`;
    else if (m === "recovery")
      area.innerHTML = `<div class="field"><label>Recovery code</label><input id="mfaCode" placeholder="XXXXXXXXXX" /></div>`;
  }
  sel.onchange = updateInput;
  updateInput();

  document.getElementById("mfaVerify").onclick = () => {
    const m = sel.value;
    const btn = document.getElementById("mfaVerify");
    btn.disabled = true;
    btn.textContent = "Verifying...";
    setTimeout(() => {
      let ok = false;
      if (m === "passkey") ok = true;
      else if (m === "authenticatorApp")
        ok = document.getElementById("mfaCode").value === "123456";
      else if (m === "sms")
        ok = document.getElementById("mfaCode").value === "654321";
      else if (m === "recovery") {
        const code = document
          .getElementById("mfaCode")
          .value.trim()
          .toUpperCase();
        const idx = u.mfa.recoveryCodes.indexOf(code);
        if (idx >= 0) {
          u.mfa.recoveryCodes.splice(idx, 1);
          ok = true;
        }
      }
      if (ok) {
        session.currentUser = session.pendingMfaUser;
        session.pendingMfaUser = null;
        session.view = "profile";
        flash("success", "Verified successfully");
      } else {
        btn.disabled = false;
        btn.textContent = "Verify";
        flash("error", "Verification failed");
      }
    }, 600);
  };
  document.getElementById("mfaCancel").onclick = () => {
    session.pendingMfaUser = null;
    session.view = "login";
    render();
  };
}

function bindProfile() {
  const u = users[session.currentUser];

  document.querySelectorAll("[data-action]").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-action");
      session.profileMethodOpen = id;
      render();
    };
  });
  document.querySelectorAll("[data-primary]").forEach((b) => {
    b.onclick = () => {
      u.mfa.primary = b.getAttribute("data-primary");
      flash("success", "Primary method updated");
    };
  });
  document.querySelectorAll("[data-remove]").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-remove");
      if (id === "passkey") u.mfa.passkey = false;
      if (id === "authenticatorApp") u.mfa.authenticatorApp = false;
      if (id === "sms") u.mfa.sms = null;
      if (id === "recovery") u.mfa.recoveryCodes = [];
      if (u.mfa.primary === id) u.mfa.primary = null;
      if (session.profileMethodOpen === id) session.profileMethodOpen = null;
      flash("success", "Method removed");
    };
  });

  if (session.profileMethodOpen === "passkey") {
    document.getElementById("pkReg").onclick = () => {
      const b = document.getElementById("pkReg");
      b.disabled = true;
      b.textContent = "Registering...";
      setTimeout(() => {
        u.mfa.passkey = true;
        if (!u.mfa.primary) u.mfa.primary = "passkey";
        flash("success", "Passkey registered");
      }, 700);
    };
  } else if (session.profileMethodOpen === "authenticatorApp") {
    document.getElementById("aaVerify").onclick = () => {
      if (document.getElementById("aaCode").value === "123456") {
        u.mfa.authenticatorApp = true;
        if (!u.mfa.primary) u.mfa.primary = "authenticatorApp";
        flash("success", "Authenticator app enabled");
      } else flash("error", "Invalid code");
    };
  } else if (session.profileMethodOpen === "sms") {
    document.getElementById("smsVerify").onclick = () => {
      const phone = document.getElementById("smsPhone").value.trim();
      if (!phone) {
        flash("error", "Phone number required");
        return;
      }
      if (document.getElementById("smsCode").value === "654321") {
        u.mfa.sms = phone;
        if (!u.mfa.primary) u.mfa.primary = "sms";
        flash("success", "SMS enabled");
      } else flash("error", "Invalid code");
    };
  } else if (session.profileMethodOpen === "recovery") {
    document.getElementById("rcGen").onclick = () => {
      u.mfa.recoveryCodes = Array.from({ length: 5 }, () => genCode(10));
      flash("success", "Recovery codes generated");
    };
  }
}

/* ============== RENDER ============== */
function render() {
  document.querySelectorAll(".dropdown").forEach((d) => d.remove());

  const app = document.getElementById("app");
  let html = "";

  if (session.view === "profile" && !session.currentUser) session.view = "home";
  if (session.view === "mfa" && !session.pendingMfaUser) session.view = "login";

  if (session.view === "home") html += renderHome();
  else if (session.view === "login") html += renderLogin();
  else if (session.view === "signup") html += renderSignup();
  else if (session.view === "mfa") html += renderMfaChallenge();
  else if (session.view === "profile") html += renderProfile();

  app.innerHTML = html;
  renderFlash();
  renderTopbar();

  if (session.view === "home") bindHome();
  if (session.view === "login") bindLogin();
  if (session.view === "signup") bindSignup();
  if (session.view === "mfa") bindMfa();
  if (session.view === "profile") bindProfile();
}

document.addEventListener("click", () => {
  if (session.dropdownOpen) {
    session.dropdownOpen = false;
    render();
  }
});

render();
