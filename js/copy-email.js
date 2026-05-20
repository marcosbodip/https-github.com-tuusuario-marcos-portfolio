(() => {
  const fallbackEmail = "holabodimarcos@gmail.com";
  const copyTriggerSelector = [
    "[data-copy-email]",
    "a[href^='mailto:holabodimarcos@gmail.com']",
    "a[href^='mailto:holabodimarcos%40gmail.com']"
  ].join(", ");
  let hidePanelTimeout;

  const getEmailFromTrigger = (trigger) => {
    if (trigger.dataset.copyEmail) {
      return trigger.dataset.copyEmail;
    }

    const href = trigger.getAttribute("href") || "";
    if (href.startsWith("mailto:")) {
      return decodeURIComponent(href.replace("mailto:", "").split("?")[0]) || fallbackEmail;
    }

    return fallbackEmail;
  };

  const ensurePanel = () => {
    let panel = document.querySelector("[data-copy-email-panel]");

    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.className = "copy-email-panel";
    panel.dataset.copyEmailPanel = "";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div class="copy-email-card" role="status" aria-live="polite">
        <p class="copy-email-kicker">Email copied</p>
        <p class="copy-email-address"></p>
      </div>
    `;
    document.body.append(panel);
    return panel;
  };

  const copyToClipboard = async (email) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(email);
        return true;
      } catch {
        // Fall back to a temporary textarea below.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = email;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.append(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }

    textarea.remove();
    return copied;
  };

  const showPanel = (email, copied) => {
    const panel = ensurePanel();
    const kicker = panel.querySelector(".copy-email-kicker");
    const address = panel.querySelector(".copy-email-address");

    kicker.textContent = copied ? "Email copied" : "Copy email";
    address.textContent = email;
    panel.classList.add("is-visible");
    panel.setAttribute("aria-hidden", "false");

    clearTimeout(hidePanelTimeout);
    hidePanelTimeout = setTimeout(() => {
      panel.classList.remove("is-visible");
      panel.setAttribute("aria-hidden", "true");
    }, 1800);
  };

  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest(copyTriggerSelector);

    if (!trigger) {
      return;
    }

    event.preventDefault();
    const email = getEmailFromTrigger(trigger);
    const copied = await copyToClipboard(email);
    showPanel(email, copied);
  });
})();
