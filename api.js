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

async function getMfaMethodsByUserId(userId) {
	const endpoint = apiBaseUrl + '/users/' + userId + "/mfa/methods";
	const response = await fetch(endpoint, {
		method: 'GET' ,
		headers: {
			'Content-Type': 'application/json',
		}
	});
	
	const result = await response.json();
	console.log("Success:", result);		
	return result.data.methods;
}

// Start Passkey Enrollment
async function startPasskeyEnrollment(userId) {
	try {
		
		const clientContext = {
			deviceId: getDeviceId(),
			userAgent: navigator.userAgent
		}
		
		const payload = {
			"rpId": "example.com",
			"clientContext": clientContext
		}

		const endpoint = apiBaseUrl + '/users/' + userId + "/mfa/passkeys/enrollments/options";
		const response = await fetch(endpoint, {
			method: 'POST' ,
			headers: {
				'Content-Type': 'application/json',
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
async function submitPasskeyChallenge(userId, methodId) {
	try {
  
		const clientContext = {
			deviceId: getDeviceId(),
			userAgent: navigator.userAgent
		}

		const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString();
		const payload = {
			userId,
			methodId,
			purpose: "MFA",
			maxAttempts: 5,
			expiresAt,
			clientContext
		}
	  
		const endpoint = apiBaseUrl + '/auth/mfa/challenges';
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
		
		const optionsFromApi = JSON.parse(result.data.payload.json);
		  
		optionsFromApi.challenge =
			base64urlToArrayBuffer(optionsFromApi.challenge);

		// allowCredentials
		optionsFromApi.allowCredentials =
		  optionsFromApi.allowCredentials.map(cred => ({
			...cred,
			id: base64urlToArrayBuffer(cred.id)
		  }));

		return await verifyPasskeyChallengeResponse(result.data.challengeId, optionsFromApi);
		
	} catch (err) {
		console.error("Error:", err);
		flash("error", "Verification failed");
	}
}

// Verify the challenge response
async function verifyPasskeyChallengeResponse(challengeId, optionsFromApi)
{
	try {
		console.log("Challenge publicKey:", optionsFromApi);

		const assertion = await navigator.credentials.get({
		  publicKey: optionsFromApi
		});
		
		console.log("Assertion:", assertion);

		const payload = {
			proof: JSON.stringify(assertion)
		}

		const endpoint = apiBaseUrl + '/auth/mfa/challenges/' + challengeId + '/verify';
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
		
		if (result.data.accessToken) {
			localStorage.setItem("mfa-access-token", JSON.stringify({
				type: result.data.tokenType,
				token: result.data.accessToken
			}));
			return true;
		}
		return false;
	} catch(err) {
		console.error("Error:", err);
		flash("error", "Verification failed");
		return false;
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

// MFA Recovery Code
async function verifyRecoveryCode(userId, methodId, code) {
	const challengeId = await submitRecoveryCodeChallenge(userId, methodId);
	if (!challengeId) {
		flash("error", "Verification failed");
		return false;
	}
	return await verifyRecoveryCodeChallenge(challengeId, code);
}

// MFA Recovery Code Challenge
async function submitRecoveryCodeChallenge(userId, methodId) {
	try {  
		const clientContext = {
			deviceId: getDeviceId(),
			userAgent: navigator.userAgent
		}

		const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString();
		const payload = {
			userId,
			methodId,
			purpose: "MFA",
			maxAttempts: 5,
			expiresAt,
			clientContext
		}
	  
		const endpoint = apiBaseUrl + '/auth/mfa/challenges';
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
		return result.data.challengeId;
				
	} catch (err) {
		console.error("Error:", err);
		return false;
	}
}

async function verifyRecoveryCodeChallenge(challengeId, code) {
	try {
		const payload = {
			proof: code
		}

		const endpoint = apiBaseUrl + '/auth/mfa/challenges/' + challengeId + '/verify';
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