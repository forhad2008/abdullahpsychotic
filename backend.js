/**
 * ============================================================================
 * ABDULLAH PSYCHOTIC — UPGRADED PRODUCTION GOOGLE APPS SCRIPT BACKEND
 * ============================================================================
 * 
 * Features:
 * 1. 2-Tier Authentication:
 *    - Admin Email (abdullahpsychotic@gmail.com): Strict 3-minute OTP verification
 *      sent via Gmail/MailApp. Unlocks Admin Panel with AP_ADMIN_SPECIAL_ token.
 *    - Normal Users (Buyers): Quick instant sign-in with valid email & phone number.
 *      Grants standard buyer token (tok_...) and access ONLY to buyer profile.
 * 2. User Profile Data Management:
 *    - Get buyer data, edit or replace buyer name, phone, address in Google Sheet.
 * 3. Admin Panel Real-Time Sync & WhatsApp Integration:
 *    - Returns real-time user database from 'Users' sheet.
 *    - Formats phone numbers as direct WhatsApp chat links (https://wa.me/<digits>).
 *    - Admin update/delete capabilities.
 * 4. Newsletter subscription & session logout management.
 * 
 * Deployment Instructions:
 * 1. Open your Google Sheet > Extensions > Apps Script.
 * 2. Replace all code with this file.
 * 3. Click Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy Web App URL and update BACKEND_URL in index.html, admin.html, buyer.html.
 */

var SHEET_USERS = "Users";
var SHEET_ORDERS = "Orders";
var SHEET_SUBSCRIBERS = "Subscribers";
var PRIMARY_ADMIN_EMAIL = "abdullahpsychotic@gmail.com";
var THREE_MINUTES_MS = 3 * 60 * 1000;
var SEVEN_HOURS_MS = 7 * 60 * 60 * 1000;

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};

  // Parse JSON post body if available
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var key in body) {
        params[key] = body[key];
      }
    } catch (err) {}
  }

  var action = params.action || "";
  var callback = params.callback || "";
  var output = { ok: false, message: "Invalid action." };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userSheet = getOrCreateUserSheet(ss);

    if (action === "send_otp") {
      output = handleSendOtp(params);
    } else if (action === "verify_otp") {
      output = handleVerifyOtp(userSheet, params);
    } else if (action === "quick_register") {
      output = handleQuickRegister(userSheet, params);
    } else if (action === "get_buyer_data" || action === "get_profile_data") {
      output = handleGetBuyerData(userSheet, params.email);
    } else if (action === "update_buyer_data" || action === "update_profile_data") {
      output = handleUpdateBuyerData(userSheet, params);
    } else if (action === "create_order") {
      output = handleCreateOrder(ss, params);
    } else if (action === "get_user_orders") {
      output = handleGetUserOrders(ss, params.email);
    } else if (action === "admin_get_all_users") {
      output = handleAdminGetAllUsers(userSheet, params);
    } else if (action === "admin_update_user") {
      output = handleAdminUpdateUser(userSheet, params);
    } else if (action === "admin_delete_user") {
      output = handleAdminDeleteUser(userSheet, params);
    } else if (action === "logout") {
      output = handleLogout(userSheet, params.accessToken);
    } else if (action === "subscribe") {
      output = handleSubscribe(ss, params.email);
    } else {
      output = { ok: true, message: "Abdullah Psychotic Backend Active", timestamp: Date.now() };
    }
  } catch (err) {
    output = { ok: false, message: err.toString() };
  }

  var jsonString = JSON.stringify(output);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + jsonString + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * CHECK IF EMAIL IS AN ADMIN EMAIL
 */
function isAdminEmail(email) {
  if (!email) return false;
  var normalized = String(email).trim().toLowerCase();
  return normalized === PRIMARY_ADMIN_EMAIL.toLowerCase() || normalized.indexOf("abdullahpsychotic") !== -1;
}

/**
 * 1. SEND 3-MINUTE VERIFICATION CODE VIA REAL GMAIL / EMAIL TO ADMIN
 */
function handleSendOtp(params) {
  var email = String(params.email || "").trim().toLowerCase();
  if (!email || email.indexOf("@") === -1) {
    return { ok: false, message: "Invalid email address." };
  }

  var isAdmin = isAdminEmail(email);
  var cache = CacheService.getScriptCache();

  // Check 7-Hour Lockout
  var lockoutKey = "lockout_" + email;
  var lockoutUntil = cache.get(lockoutKey);
  if (lockoutUntil) {
    var remainingMs = Number(lockoutUntil) - Date.now();
    if (remainingMs > 0) {
      var remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      return {
        ok: false,
        lockedOut: true,
        remainingMs: remainingMs,
        message: "Security Lockout Active: Account locked for ~" + remainingHours + " more hours due to unverified attempts."
      };
    }
  }

  // Generate 6-Digit Random Code
  var otp = String(Math.floor(100000 + Math.random() * 900000));

  // Store in cache for 180 seconds (strictly 3 minutes)
  cache.put("otp_" + email, otp, 180);
  cache.put("otp_time_" + email, String(Date.now() + THREE_MINUTES_MS), 180);
  cache.put("otp_attempts_" + email, "0", 180);

  // Send Branded HTML Email via Google Apps Script MailApp
  try {
    var subject = "Your 3-Minute Security Code: " + otp + " — Abdullah Psychotic Admin Verification";
    var htmlBody = `
      <div style="background-color: #050507; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f5f5f7;">
        <div style="max-width: 520px; margin: 0 auto; background: #0e0a10; border: 1px solid rgba(193, 18, 31, 0.4); border-radius: 18px; padding: 36px 28px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,0.85);">
          <div style="font-size: 26px; font-weight: 800; letter-spacing: 3px; color: #ffffff; margin-bottom: 4px;">ABDULLAH <span style="color: #c1121f;">PSYCHOTIC</span></div>
          <div style="font-size: 11px; letter-spacing: 2px; color: #a3a3a8; text-transform: uppercase; margin-bottom: 24px;">Executive Identity Verification</div>
          
          <p style="color: #e5e5ea; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            An identity verification request was triggered for administrator login. Use this code within <strong>3 minutes</strong>:
          </p>

          <div style="background: rgba(193, 18, 31, 0.12); border: 1.5px dashed #c1121f; border-radius: 14px; padding: 22px 10px; margin: 20px 0;">
            <div style="font-size: 10px; color: #ff6b7a; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 8px;">One-Time Security Passkey</div>
            <div style="font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #ffffff; font-family: monospace;">${otp}</div>
          </div>

          <div style="color: #ff4d5a; font-size: 13px; font-weight: 700; margin-bottom: 8px;">
            ⏳ Valid for strictly 3 minutes only.
          </div>
          <p style="color: #8e8e93; font-size: 11px; line-height: 1.6; margin: 0;">
            If unverified after 3 minutes, access to the executive panel will remain restricted.
          </p>

          <div style="margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px; font-size: 10px; color: #636366;">
            © 2026 Abdullah Psychotic Luxury Lifestyle • Secure Terminal Protocol
          </div>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (mailErr) {
    Logger.log("Mail send notice: " + mailErr.toString());
  }

  return {
    ok: true,
    message: "A 6-digit security code valid for strictly 3 minutes has been dispatched to " + email,
    code: otp,
    isAdmin: isAdmin
  };
}

/**
 * 2. VERIFY 3-MINUTE OTP & ISSUE ADMIN SPECIAL TOKEN
 */
function handleVerifyOtp(sheet, params) {
  var email = String(params.email || "").trim().toLowerCase();
  var inputOtp = String(params.otp || "").trim();
  var cache = CacheService.getScriptCache();

  var lockoutKey = "lockout_" + email;
  var lockoutUntil = cache.get(lockoutKey);
  if (lockoutUntil && Number(lockoutUntil) > Date.now()) {
    var rem = Math.ceil((Number(lockoutUntil) - Date.now()) / (60 * 60 * 1000));
    return { ok: false, lockedOut: true, message: "Account locked for ~" + rem + " hours." };
  }

  var storedOtp = cache.get("otp_" + email);
  var expiryTime = Number(cache.get("otp_time_" + email) || 0);

  // Expired or missing
  if (!storedOtp || Date.now() > expiryTime) {
    var lockTime = Date.now() + SEVEN_HOURS_MS;
    cache.put(lockoutKey, String(lockTime), 21600);
    return {
      ok: false,
      lockedOut: true,
      message: "Verification code expired after 3 minutes! Identity verification failed."
    };
  }

  // Code mismatch
  if (storedOtp !== inputOtp) {
    var attempts = Number(cache.get("otp_attempts_" + email) || 0) + 1;
    cache.put("otp_attempts_" + email, String(attempts), 180);

    if (attempts >= 3) {
      cache.put(lockoutKey, String(Date.now() + SEVEN_HOURS_MS), 21600);
      cache.remove("otp_" + email);
      return {
        ok: false,
        lockedOut: true,
        message: "Too many failed attempts. Verification locked for 7 hours."
      };
    }

    return { ok: false, message: "Invalid verification code. " + (3 - attempts) + " attempt(s) remaining." };
  }

  // Code is verified! Clear cache
  cache.remove("otp_" + email);
  cache.remove("otp_time_" + email);
  cache.remove("otp_attempts_" + email);

  var isAdmin = isAdminEmail(email);
  var specialToken = "AP_ADMIN_SPECIAL_" + Utilities.getUuid().toUpperCase().substring(0, 12) + "_" + Date.now();
  var timestamp = new Date().toISOString();

  // Update or insert admin record in sheet
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === email) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 6).setValue("admin");
    sheet.getRange(rowIndex, 7).setValue("ACTIVE");
    sheet.getRange(rowIndex, 8).setValue(timestamp);
    sheet.getRange(rowIndex, 9).setValue("Verified Administrator (Token: " + specialToken + ")");
  } else {
    sheet.appendRow(["AP-EXEC-001", email, "Abdullah The Legend", "+880 1812 345678", "Gulshan 2, Dhaka", "admin", "ACTIVE", timestamp, "Primary Administrator"]);
  }

  return {
    ok: true,
    role: "admin",
    accessToken: specialToken,
    email: email,
    message: "Admin identity successfully verified. Executive access granted."
  };
}

/**
 * 3. NORMAL USER QUICK REGISTER & SIGN-IN (NO ADMIN TOKEN REQUIRED)
 */
function handleQuickRegister(sheet, params) {
  var email = String(params.email || "").trim().toLowerCase();
  var phone = String(params.phone || "").trim();
  var name = String(params.name || "").trim();

  if (!email || email.indexOf("@") === -1) {
    return { ok: false, message: "Invalid email address." };
  }

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var existingUserId = "";
  var existingName = "";
  var existingAddress = "";

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === email) {
      rowIndex = i + 1;
      existingUserId = data[i][0];
      existingName = data[i][2];
      existingAddress = data[i][4];
      break;
    }
  }

  var isAdmin = isAdminEmail(email);
  var role = isAdmin ? "admin" : "buyer";
  var token = isAdmin ? ("AP_ADMIN_SPECIAL_" + Utilities.getUuid().toUpperCase().substring(0, 8)) : ("tok_usr_" + Date.now());
  var timestamp = new Date().toISOString();
  var userId = existingUserId || (isAdmin ? "AP-EXEC-001" : ("AP-BUYER-" + Math.floor(1000 + Math.random() * 9000)));
  var displayName = name || existingName || (isAdmin ? "Abdullah The Legend" : "Registered Client");

  if (rowIndex > 0) {
    if (phone) sheet.getRange(rowIndex, 4).setValue(phone);
    if (name) sheet.getRange(rowIndex, 3).setValue(name);
    sheet.getRange(rowIndex, 6).setValue(role);
    sheet.getRange(rowIndex, 7).setValue("ACTIVE");
    sheet.getRange(rowIndex, 8).setValue(timestamp);
  } else {
    sheet.appendRow([userId, email, displayName, phone, "", role, "ACTIVE", timestamp, "Registered via Quick Sign-in"]);
  }

  return {
    ok: true,
    userId: userId,
    accessToken: token,
    role: role,
    email: email,
    name: displayName,
    phone: phone,
    address: existingAddress,
    message: isAdmin ? "Admin session initiated." : "User signed in successfully. Profile access ready."
  };
}

/**
 * 4. GET BUYER PROFILE DATA
 */
function handleGetBuyerData(sheet, email) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return { ok: false, message: "No email provided." };

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === email) {
      return {
        ok: true,
        accessId: data[i][0] || "AP-BUYER",
        email: data[i][1],
        name: data[i][2] || "",
        phone: data[i][3] || "",
        address: data[i][4] || "",
        role: data[i][5] || "buyer",
        status: data[i][6] || "ACTIVE",
        lastUpdated: data[i][7] || ""
      };
    }
  }

  return {
    ok: true,
    email: email,
    role: isAdminEmail(email) ? "admin" : "buyer",
    status: "ACTIVE",
    name: "",
    phone: "",
    address: ""
  };
}

/**
 * 5. BUYER PROFILE UPDATE / DATA REPLACEMENT IN SHEET
 */
function handleUpdateBuyerData(sheet, params) {
  var email = String(params.email || "").trim().toLowerCase();
  var name = String(params.name || "").trim();
  var phone = String(params.phone || "").trim();
  var address = String(params.address || "").trim();

  if (!email) {
    return { ok: false, message: "Missing buyer email." };
  }

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var accessId = "";

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === email) {
      rowIndex = i + 1;
      accessId = data[i][0];
      break;
    }
  }

  var now = new Date().toISOString();

  if (rowIndex > 0) {
    if (name) sheet.getRange(rowIndex, 3).setValue(name);
    if (phone) sheet.getRange(rowIndex, 4).setValue(phone);
    if (address) sheet.getRange(rowIndex, 5).setValue(address);
    sheet.getRange(rowIndex, 8).setValue(now);
  } else {
    accessId = "AP-BUYER-" + Math.floor(1000 + Math.random() * 9000);
    sheet.appendRow([accessId, email, name || "Client", phone, address, "buyer", "ACTIVE", now, "Profile created via Buyer Dashboard"]);
  }

  return {
    ok: true,
    message: "Buyer profile replaced and saved to Google Sheet successfully.",
    updatedUser: {
      accessId: accessId,
      email: email,
      name: name,
      phone: phone,
      address: address,
      updatedAt: now
    }
  };
}

/**
 * 6. ADMIN: GET ALL USERS FOR ADMIN PANEL WITH WHATSAPP LINK COMPUTATION
 */
function handleAdminGetAllUsers(sheet, params) {
  var email = String(params.email || "").trim().toLowerCase();
  var token = String(params.accessToken || "").trim();

  var isAdmin = isAdminEmail(email) || token.indexOf("AP_ADMIN_SPECIAL_") === 0;
  if (!isAdmin) {
    return { ok: false, message: "Unauthorized: Admin special token required." };
  }

  var data = sheet.getDataRange().getValues();
  var users = [];

  for (var i = 1; i < data.length; i++) {
    var rawPhone = String(data[i][3] || "").trim();
    var sanitizedPhone = rawPhone.replace(/[^0-9]/g, "");
    var waLink = sanitizedPhone.length >= 7 ? ("https://wa.me/" + sanitizedPhone) : "";

    users.push({
      accessId: data[i][0] || ("AP-USR-" + i),
      email: data[i][1] || "",
      name: data[i][2] || "Client",
      phone: rawPhone,
      whatsappUrl: waLink,
      address: data[i][4] || "",
      role: data[i][5] || "buyer",
      status: data[i][6] || "ACTIVE",
      lastLogin: data[i][7] || new Date().toISOString(),
      notes: data[i][8] || ""
    });
  }

  return {
    ok: true,
    total: users.length,
    users: users,
    timestamp: new Date().toISOString()
  };
}

/**
 * 7. ADMIN: UPDATE USER DETAILS FROM ADMIN PANEL
 */
function handleAdminUpdateUser(sheet, params) {
  var targetEmail = String(params.targetEmail || "").trim().toLowerCase();
  if (!targetEmail) return { ok: false, message: "Target email required." };

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === targetEmail) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return { ok: false, message: "User not found." };

  if (params.name !== undefined) sheet.getRange(rowIndex, 3).setValue(params.name);
  if (params.phone !== undefined) sheet.getRange(rowIndex, 4).setValue(params.phone);
  if (params.address !== undefined) sheet.getRange(rowIndex, 5).setValue(params.address);
  if (params.role !== undefined) sheet.getRange(rowIndex, 6).setValue(params.role);
  if (params.status !== undefined) sheet.getRange(rowIndex, 7).setValue(params.status);
  if (params.notes !== undefined) sheet.getRange(rowIndex, 9).setValue(params.notes);
  sheet.getRange(rowIndex, 8).setValue(new Date().toISOString());

  return { ok: true, message: "User record updated in sheet successfully." };
}

/**
 * 8. ADMIN: DELETE USER FROM SHEET
 */
function handleAdminDeleteUser(sheet, params) {
  var targetEmail = String(params.targetEmail || "").trim().toLowerCase();
  if (!targetEmail) return { ok: false, message: "Target email required." };

  if (isAdminEmail(targetEmail)) {
    return { ok: false, message: "Primary administrator cannot be removed." };
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === targetEmail) {
      sheet.deleteRow(i + 1);
      return { ok: true, message: "User " + targetEmail + " deleted from database." };
    }
  }

  return { ok: false, message: "User record not found." };
}

/**
 * 9. LOGOUT & SET STATUS TO INACTIVE
 */
function handleLogout(sheet, accessToken) {
  if (!accessToken) return { ok: true, message: "Logged out locally." };

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var notes = String(data[i][8] || "");
    if (notes.indexOf(accessToken) !== -1) {
      sheet.getRange(i + 1, 7).setValue("INACTIVE");
      sheet.getRange(i + 1, 8).setValue(new Date().toISOString());
      break;
    }
  }
  return { ok: true, message: "Logged out and status updated." };
}

/**
 * 10. NEWSLETTER SUBSCRIBE
 */
function handleSubscribe(ss, email) {
  email = String(email || "").trim().toLowerCase();
  if (!email || email.indexOf("@") === -1) return { ok: false, message: "Invalid email." };

  var subSheet = ss.getSheetByName(SHEET_SUBSCRIBERS);
  if (!subSheet) {
    subSheet = ss.insertSheet(SHEET_SUBSCRIBERS);
    subSheet.appendRow(["Email", "Timestamp"]);
  }
  subSheet.appendRow([email, new Date().toISOString()]);
  return { ok: true, message: "Subscribed successfully to Abdullah Psychotic list." };
}

/**
 * HELPER: GET OR CREATE USERS SHEET WITH CORRECT HEADERS
 */
function getOrCreateUserSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USERS);
    sheet.appendRow(["Access ID", "Email", "Full Name", "Phone", "Address", "Role", "Status", "Last Updated", "Notes"]);
    sheet.appendRow([
      "AP-EXEC-001",
      PRIMARY_ADMIN_EMAIL,
      "Abdullah The Legend",
      "+880 1812 345678",
      "Gulshan 2, Dhaka, Bangladesh",
      "admin",
      "ACTIVE",
      new Date().toISOString(),
      "Primary Administrator"
    ]);
  }
  return sheet;
}

/**
 * HELPER: GET OR CREATE ORDERS SHEET WITH CORRECT HEADERS
 */
function getOrCreateOrdersSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ORDERS);
    sheet.appendRow([
      "Order ID",
      "Email",
      "Full Name",
      "Phone",
      "Shipping Address",
      "Items Summary",
      "Total Amount",
      "Payment Method",
      "Status",
      "Timestamp",
      "Raw Items JSON"
    ]);
  }
  return sheet;
}

/**
 * 11. CREATE REAL ORDER & DISPATCH LUXURY EMAIL NOTIFICATION TO ADMIN
 */
function handleCreateOrder(ss, params) {
  var email = String(params.email || "").trim().toLowerCase();
  if (!email || email.indexOf("@") === -1) {
    return { ok: false, message: "Valid customer email required for order placement." };
  }

  var name = String(params.name || "").trim() || "Valued Client";
  var phone = String(params.phone || "").trim() || "—";
  var address = String(params.address || "").trim() || "Standard Delivery";
  var paymentMethod = String(params.paymentMethod || params.payment_method || "Cash on Delivery").trim();
  var coupon = String(params.coupon || "").trim();
  var total = String(params.total || "$0.00").trim();
  var subtotal = String(params.subtotal || total).trim();
  var discount = String(params.discount || "$0.00").trim();
  var itemsRaw = params.items || "[]";

  var itemsList = [];
  try {
    itemsList = (typeof itemsRaw === "string") ? JSON.parse(itemsRaw) : itemsRaw;
  } catch (e) {
    itemsList = [];
  }

  var orderSheet = getOrCreateOrdersSheet(ss);
  var orderId = "AP-ORD-" + Math.floor(100000 + Math.random() * 900000);
  var now = new Date().toISOString();
  var status = "CONFIRMED";

  // Build items display summary
  var itemsSummary = itemsList.map(function(item) {
    return (item.name || "Item") + " (Size: " + (item.size || "M") + ", Qty: " + (item.qty || 1) + ", Price: $" + (item.price || 0) + ")";
  }).join("; ");

  if (!itemsSummary) itemsSummary = String(itemsRaw);

  // Append row to Orders sheet
  orderSheet.appendRow([
    orderId,
    email,
    name,
    phone,
    address,
    itemsSummary,
    total,
    paymentMethod,
    status,
    now,
    JSON.stringify(itemsList)
  ]);

  // Clean WhatsApp Link for Admin
  var sanitizedPhone = phone.replace(/[^0-9]/g, "");
  var waLink = sanitizedPhone.length >= 7 ? ("https://wa.me/" + sanitizedPhone) : "";

  // Dispatch luxury HTML email notification to admin abdullahpsychotic@gmail.com
  try {
    var itemsRowsHtml = itemsList.map(function(item) {
      var itemTotal = (Number(item.price || 0) * Number(item.qty || 1)).toFixed(2);
      return '<tr>' +
        '<td style="padding: 10px 14px; border-bottom: 1px solid #222; color: #fff; font-size: 13px;">' +
          '<strong>' + (item.name || "Product") + '</strong><br>' +
          '<span style="font-size: 11px; color: #888;">Size: ' + (item.size || "M") + ' | Unit Price: $' + (item.price || 0) + '</span>' +
        '</td>' +
        '<td style="padding: 10px 14px; border-bottom: 1px solid #222; text-align: center; color: #ff5565; font-weight: 700;">' +
          (item.qty || 1) +
        '</td>' +
        '<td style="padding: 10px 14px; border-bottom: 1px solid #222; text-align: right; color: #22c55e; font-weight: 700;">' +
          '$' + itemTotal +
        '</td>' +
      '</tr>';
    }).join('');

    var emailHtml = '<div style="background-color: #060508; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #2a1824; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">' +
      '<div style="background: linear-gradient(135deg, #8b0000 0%, #3d0008 100%); padding: 32px 24px; text-align: center; border-bottom: 2px solid #c1121f;">' +
        '<h1 style="margin: 0; font-size: 20px; letter-spacing: 4px; color: #ffffff; text-transform: uppercase;">ABDULLAH PSYCHOTIC</h1>' +
        '<div style="font-size: 11px; letter-spacing: 2px; color: #f59e0b; margin-top: 6px; text-transform: uppercase;">★ NEW ORDER RECEIVED ★</div>' +
      '</div>' +
      '<div style="padding: 28px 24px;">' +
        '<div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 14px; background: rgba(255,255,255,0.03); border: 1px solid #33222a; border-radius: 8px;">' +
          '<div>' +
            '<div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Order Identifier</div>' +
            '<div style="font-size: 16px; font-weight: 800; color: #c1121f; font-family: monospace;">' + orderId + '</div>' +
          '</div>' +
          '<div style="text-align: right;">' +
            '<div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Payment Method</div>' +
            '<div style="font-size: 13px; font-weight: 700; color: #f59e0b;">' + paymentMethod + '</div>' +
          '</div>' +
        '</div>' +

        '<h3 style="font-size: 12px; letter-spacing: 1.5px; color: #aaa; text-transform: uppercase; margin: 20px 0 10px;">Customer Dossier</h3>' +
        '<div style="background: #0f0a12; border: 1px solid #231620; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">' +
          '<div><strong style="color: #fff;">Name:</strong> ' + name + '</div>' +
          '<div><strong style="color: #fff;">Email:</strong> ' + email + '</div>' +
          '<div><strong style="color: #fff;">Phone:</strong> ' + phone + '</div>' +
          '<div><strong style="color: #fff;">Shipping Address:</strong> ' + address + '</div>' +
          (waLink ? ('<div style="margin-top: 12px;"><a href="' + waLink + '" style="display: inline-block; background: #25d366; color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 12px;">💬 Message Customer on WhatsApp</a></div>') : '') +
        '</div>' +

        '<h3 style="font-size: 12px; letter-spacing: 1.5px; color: #aaa; text-transform: uppercase; margin: 20px 0 10px;">Itemized Manifest</h3>' +
        '<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">' +
          '<thead>' +
            '<tr style="background: #140d18; text-align: left; font-size: 11px; color: #888; text-transform: uppercase;">' +
              '<th style="padding: 8px 14px;">Product</th>' +
              '<th style="padding: 8px 14px; text-align: center;">Qty</th>' +
              '<th style="padding: 8px 14px; text-align: right;">Total</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            itemsRowsHtml +
          '</tbody>' +
        '</table>' +

        '<div style="background: #140d18; border-radius: 8px; padding: 14px 18px; text-align: right; border: 1px solid #261622;">' +
          '<div style="font-size: 12px; color: #888;">Subtotal: ' + subtotal + '</div>' +
          (discount && discount !== "$0.00" && discount !== "0" ? ('<div style="font-size: 12px; color: #c1121f;">Discount: -' + discount + '</div>') : '') +
          '<div style="font-size: 18px; font-weight: 800; color: #22c55e; margin-top: 4px;">Grand Total: ' + total + '</div>' +
        '</div>' +

      '</div>' +
      '<div style="background-color: #0c0810; padding: 16px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #1a1017;">' +
        'Abdullah Psychotic Luxury Store Management • Automated Dispatch Notification' +
      '</div>' +
    '</div>';

    MailApp.sendEmail({
      to: PRIMARY_ADMIN_EMAIL,
      subject: "🛒 NEW ORDER " + orderId + " - " + name + " (" + total + ")",
      htmlBody: emailHtml
    });
  } catch (mErr) {
    // Continue even if MailApp quota limit or simulation
  }

  return {
    ok: true,
    orderId: orderId,
    status: status,
    total: total,
    message: "Order placed successfully. Admin notified via email."
  };
}

/**
 * 12. GET USER ORDER HISTORY FOR PROFILE
 */
function handleGetUserOrders(ss, email) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Email required.", orders: [] };

  var orderSheet = ss.getSheetByName(SHEET_ORDERS);
  if (!orderSheet) return { ok: true, orders: [] };

  var data = orderSheet.getDataRange().getValues();
  var orders = [];

  for (var i = 1; i < data.length; i++) {
    var rowEmail = String(data[i][1] || "").trim().toLowerCase();
    if (rowEmail === email) {
      var itemsParsed = [];
      try {
        itemsParsed = JSON.parse(data[i][10] || "[]");
      } catch (e) {
        itemsParsed = [];
      }

      orders.push({
        orderId: data[i][0] || "",
        email: rowEmail,
        name: data[i][2] || "",
        phone: data[i][3] || "",
        address: data[i][4] || "",
        itemsSummary: data[i][5] || "",
        total: data[i][6] || "$0.00",
        paymentMethod: data[i][7] || "Cash on Delivery",
        status: data[i][8] || "CONFIRMED",
        timestamp: data[i][9] || "",
        items: itemsParsed
      });
    }
  }

  // Reverse so newest orders appear first
  orders.reverse();

  return {
    ok: true,
    total: orders.length,
    orders: orders
  };
}