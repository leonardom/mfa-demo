const apiBaseUrl = "https://localhost:7065/v1";

// Utilities
function buf2base64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base642buf(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function getDeviceId() {
	let id = localStorage.getItem("my_app_device_id");
	if (!id) {
		id = window.crypto.randomUUID();
		localStorage.setItem("my_app_device_id", id);
	}
	return id;
}

function base64urlToArrayBuffer(base64url) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding)
	.replace(/-/g, '+')
	.replace(/_/g, '/');

  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
	buffer[i] = raw.charCodeAt(i);
  }

  return buffer.buffer;
}

let credentialID = null;

// Return user's MFA method
async function getMfaMethodsByUserId(userId) {
	try {
		const endpoint = `${apiBaseUrl}/users/${userId}/mfa/methods`;
		const response = await fetch(endpoint, {
			method: 'GET' ,
			headers: {
				'Content-Type': 'application/json',
			}
		});
		
		const result = await response.json();
		console.log("Success:", result);		
		return result.data.methods;
	} catch(err) {
		console.error("Error:", err);
		flash("error", "Could not connect to MFA API");
		return [];
	}
}

// Set MFA method as primary
async function setMfaMethodAsPrimary(userId, methodId) {
	try {
		const endpoint = `${apiBaseUrl}/users/${userId}/mfa/methods/${methodId}/primary`;
		console.log(`Set MFA method as primary request: PATCH ${endpoint}`);	
		const response = await fetch(endpoint, {
			method: 'PATCH' ,
			headers: {
				'Content-Type': 'application/json',
			}
		});
		
		const result = await response.json();
		console.log("Set MFA method as primary response:",  JSON.stringify(result, null, 2));
		return result.data;
	} catch (err) {
		console.error("Error:", err);
	}
}

// Start Passkey Enrollment
async function startPasskeyEnrollment(userId) {
	try {
				
		const payload = {
			"rpId": "example.com",
		}

		const endpoint = apiBaseUrl + '/users/' + userId + "/mfa/passkeys/enrollments/options";
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
				'X-Device-Id': getDeviceId(),
			},
			body: JSON.stringify(payload)
		});
		
		const result = await response.json();
		console.log("Success:", result);		
		const optionsFromApi = JSON.parse(result.data.credentialCreationOptionsJson);		

		optionsFromApi.challenge =
		  base64urlToArrayBuffer(optionsFromApi.challenge);

		optionsFromApi.user.id =
		  base64urlToArrayBuffer(optionsFromApi.user.id);

		// If you ever add excludeCredentials:
		optionsFromApi.excludeCredentials =
		  optionsFromApi.excludeCredentials.map(cred => ({
			...cred,
			id: base64urlToArrayBuffer(cred.id)
		  }));

		console.log("Credential options:", optionsFromApi);

		const credential = await navigator.credentials.create({
		  publicKey: optionsFromApi
		});
		
		console.log("Credential created:", credential);
		return await completePasskeyEnrollment(userId, result.data.enrollmentId, credential);
	}
	catch(error) {
		console.error("Error:", error);
		flash("error", "Registration failed");
		return false;
	}
}

// Complete Passkey Enrollment
async function completePasskeyEnrollment(userId, enrollmentId, credentialResponse) {
	try {
		const credentialID = buf2base64(credentialResponse.rawId);
	
		const payload = {
			attestationResponseJson: JSON.stringify(credentialResponse)
		}

		console.log("Complete enrollment payload:", payload);
		
		const endpoint = apiBaseUrl + '/users/' + userId + "/mfa/passkeys/enrollments/" + enrollmentId + "/complete";
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload)
		});
		console.log("Request response:", response);	

		const result = await response.json();
		console.log("Success:", result);		
		return true;
	} catch(error) {
		console.error("Error:", error);
		flash("error", "Registration failed");
		return false;
	}
}


// MFA Passkey Challenge
async function verifyPasskey(userId, methodId) {
	try {
  
		//1. Submit challenge request
		const data = await submitMfaChallenge(userId, methodId, "MFA for demo");
		
		//3. Parse response
		const optionsFromApi = JSON.parse(data.payload.json);
		
		// change challenge to array buffer
		optionsFromApi.challenge =
			base64urlToArrayBuffer(optionsFromApi.challenge);

		// change allowCredentials to array buffer
		optionsFromApi.allowCredentials =
		  optionsFromApi.allowCredentials.map(cred => ({
			...cred,
			id: base64urlToArrayBuffer(cred.id)
		  }));

		console.log("Challenge publicKey:", optionsFromApi);
		
		//4. Get passkey credentials
		const assertion = await navigator.credentials.get({
		  publicKey: optionsFromApi
		});
		
		console.log("Assertion:", assertion);

		//5. Verify the challenge
		return await verifyMfaChallenge(data.challengeId, JSON.stringify(assertion));
	} catch (err) {
		console.error("Error:", err);
		flash("error", "Verification failed");
	}
}

// Rotate recovery codes
async function submitRecoveryCodesRotate(userId)
{
	try {
		const payload = {
			count: 5
		}
		const endpoint = apiBaseUrl + '/users/' + userId + '/mfa/recovery-codes/rotate';
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload)
		});
		console.log("Request response:", response);	
		
		const result = await response.json();
		console.log("Success:", result);
		
		return result.data.plaintextCodes;
	} catch(err) {
		console.error("Error:", err);
		flash("error", "Recovery codes rotation failed");
	}		
}

// Totp start enrollment
async function startTotpEnrollment(userId) {
	try {
		const payload = {
			displayName: `TOTP for ${userId}`,
			issuer: "MFA Demo App"
		};
		const endpoint = apiBaseUrl + '/users/' + userId + '/mfa/totp/enrollments';
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload)
		});
		console.log("Request response:", response);	
		
		const result = await response.json();
		console.log("Success:", result);
		
		return result.data;
	}
	catch(err) {
		console.error("Error:", err);
		flash("error", "Totp enrollment failed");
	}
}

// Totp confirm enrollment
async function confirmTotpEnrollment(userId, code) {
	try {
		const payload = {
			code
		};
		const endpoint = apiBaseUrl + '/users/' + userId + '/mfa/totp/enrollments/confirm';
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload)
		});
		console.log("Request response:", response);	
		
		const result = await response.json();
		console.log("Success:", result);
		
		return result.data.isValid;
	}
	catch(err) {
		console.error("Error:", err);
		flash("error", "Totp enrollment failed");
		return false;
	}
}

// MFA Code Challenge
async function submitMfaChallenge(userId, methodId, purpose) {
	try { 
		//1. Prepare payload
		const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString();
		const payload = {
			userId,
			methodId,
			purpose,
			maxAttempts: 5,
			expiresAt
		}
	  
		//2. Submit request
		const endpoint = apiBaseUrl + '/auth/mfa/challenges';
		console.log(`MFA challenge request: ${endpoint}`, JSON.stringify(payload, null, 2));	
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
				'X-Device-Id': getDeviceId(),
			},
			body: JSON.stringify(payload)
		});
	
		const result = await response.json();
		console.log("MFA challenge response:",  JSON.stringify(result, null, 2));		
		
		return result.data;
	} catch (err) {
		console.error("Error:", err);
		return false;
	}
}

// Verify challenge
async function verifyMfaChallenge(challengeId, code) {
	try {
		const payload = {
			proof: code
		}

		const endpoint = apiBaseUrl + '/auth/mfa/challenges/' + challengeId + '/verify';
		console.log(`MFA verify challenge request: ${endpoint}`, JSON.stringify(payload, null, 2));	
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload)
		});
		
		const result = await response.json();
		console.log("MFA challenge response:",  JSON.stringify(result, null, 2));
		
		if (result.data.accessToken) {
			localStorage.setItem("mfa-access-token", JSON.stringify({
				type: result.data.tokenType,
				token: result.data.accessToken
			}));
			return true;
		}
		return false;
	} catch (err) {
		console.error("Error:", err);
		return false;
	}
}

// Verify MFA code
async function verifyMfaCode(userId, methodId, code) {
	const { challengeId } = await submitMfaChallenge(userId, methodId, "MFA for demo");
	if (!challengeId) {
		flash("error", "Verification failed");
		return false;
	}
	return await verifyMfaChallenge(challengeId, code);
}

