/* QA SAFETY GATE: real private server not provisioned or approved.
 * Never place OAuth secrets, database keys or Gmail refresh tokens here.
 * Do not change enabled to true without an approved private HTTPS API,
 * Google OAuth client validation, real-device acceptance and release signoff.
 */
window.ControlCentreBackendConfig=Object.freeze({
  enabled:false,
  endpoint:null,
  googleClientId:null
});
