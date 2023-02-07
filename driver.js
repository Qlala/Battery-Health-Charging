'use strict';
const {Gio, GLib} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = imports.misc.config;
const BATTERY_DEVICE='/sys/class/power_supply/CMB0/';

const END_THRESHOLD_DEVICE_PATH = '/sys/class/power_supply/BAT0/charge_control_end_threshold';
const BATTERY_CARE_LIMIT = '/sys/devices/platform/lg-laptop/battery_care_limit';
const START_THRESHOLD_DEVICE_PATH = '/sys/class/power_supply/BAT0/charge_control_start_threshold';


/**
 * Test file/direcory exists
 *
 * @param {string} path File/directory path
 * @returns {boolean}
 */
function fileExists(path) {
    try {
        const f = Gio.File.new_for_path(path);
        return f.query_exists(null);
    } catch (e) {
        return false;
    }
}

/**
 * Read file contents
 *
 * @param {string} path Path of file
 * @returns {string} File contents
 */
function readFile(path) {
    try {
        const f = Gio.File.new_for_path(path);
        const [, contents] = f.load_contents(null);
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(contents);
    } catch (e) {
        return null;
    }
}

/**
 * Read integer value from file
 *
 * @param {string} path Path of file
 * @returns {number|null} Return a integer or null
 */
function readFileInt(path) {
    try {
        const v = readFile(path);
        if (v)
            return parseInt(v);
        else
            return null;
    } catch (e) {
        return null;
    }
}

/**
 * Checks if charge_control_start_threshold exist.
 *
 * @returns {boolean} true if supported
 */
function isChargeStartThresholdSupported() {
    if (fileExists(START_THRESHOLD_DEVICE_PATH))
        return true;

    return false;
}
function isChargeEndThresholdSupported() {
    if (fileExists(END_THRESHOLD_DEVICE_PATH))
        return true;

    return false;
}
function isBatteryCareLimitSupported() {
    if (fileExists(BATTERY_CARE_LIMIT))
        return true;

    return false;
}

/**
 * Read value from charge_control_end_threshold
 *
 * @returns {number} Return a integer.
 */
function getCurrentEndLimitValue() {
    if( isBatteryCareLimitSupported())
        return readFileInt(BATTERY_CARE_LIMIT);
    return readFileInt(END_THRESHOLD_DEVICE_PATH);
}

/**
 * Read value from charge_control_start_threshold
 *
 * @returns {number} Return a integer.
 */
function getCurrentStartLimitValue() {
    return readFileInt(START_THRESHOLD_DEVICE_PATH);
}

function getBatteryCareLimitValue() {
    return readFileInt(BATTERY_CARE_LIMIT);
}

/**
 * Execute bash command asynchronously
 *
 * @param {string} command Command-Line
 */
function spawnCommandLine(command) {
    try {
        GLib.spawn_command_line_async(command);
    } catch (e) {
        logError(`Spawning command failed: ${command}`, e);
    }
}
/*****
 * 
 * get Suported charge level
 * @param {integer} value
 */
function isChargeLevelSupported(value) {
    if(isBatteryCareLimitSupported()){
        return value==80 || value==100;
    }else if(isChargeEndThresholdSupported()){
        return value==80 || value==100||value==60;
    }
}



/**
 * Set limit in sysfs
 *
 * @param {string} value Limit Value
 * @param endValue
 * @param chargeStartThresholdSupported
 */
function setLimit(endValue, chargeStartThresholdSupported) {
    if (isChargeEndThresholdSupported()) {
        let chargeEndThresholdCmd = `bash -c "echo ${endValue} > ${END_THRESHOLD_DEVICE_PATH}\n"`;
        spawnCommandLine(chargeEndThresholdCmd);
        if (chargeStartThresholdSupported) {
            let startValue = parseInt(endValue) - 2;
            let chargeStartThresholdCmd = `bash -c "echo ${startValue} > ${START_THRESHOLD_DEVICE_PATH}\n"`;
            spawnCommandLine(chargeStartThresholdCmd);
        }
    }else if( isBatteryCareLimitSupported()){
        let batteryCareLimitCmd = `bash -c "echo ${endValue} > ${BATTERY_CARE_LIMIT}\n"`;
        spawnCommandLine(batteryCareLimitCmd);
    }
}

/**
 *  Gets Gnome version
 *
 * @returns {number} Gnome Version
 */
function isSupported() {
    let currentVersion = Config.PACKAGE_VERSION.split('.');
    return currentVersion[0] >= 43;
}

/**
 * Test if file is writable
 *
 * @returns {boolean} false file writable
 */
function checkAuthRequired() {
    try {
        const f = Gio.File.new_for_path(END_THRESHOLD_DEVICE_PATH);
        const info = f.query_info('access::*', Gio.FileQueryInfoFlags.NONE, null);
        if (!info.get_attribute_boolean('access::can-write'))
            return true;
    } catch (e) {
        // Ignored
    }
    try {
        const f = Gio.File.new_for_path(BATTERY_CARE_LIMIT);
        const info = f.query_info('access::*', Gio.FileQueryInfoFlags.NONE, null);
        if (!info.get_attribute_boolean('access::can-write'))
            return true;
    } catch (e) {
        // Ignored
    }
    if(isChargeStartThresholdSupported()) {
        try {
            const f = Gio.File.new_for_path(START_THRESHOLD_DEVICE_PATH);
            const info = f.query_info('access::*', Gio.FileQueryInfoFlags.NONE, null);
            if (!info.get_attribute_boolean('access::can-write'))
                return true;
        } catch (e) {
            // Ignored
        }
    }
    return false;
}

/**
 * Checks for different incompatibilities and notifies accordingly
 *
 * @returns {number} type of non-compabitilty
 */
function checkInCompatibility() {
    if (!isSupported())
        return 1;

    if (!fileExists(END_THRESHOLD_DEVICE_PATH))
        if(!fileExists(BATTERY_CARE_LIMIT))
            return 2;

    if (checkAuthRequired()) {
        ExtensionUtils.getSettings().set_boolean('install-service', false);
        return 3;
    }

    return 0;
}

/**
 * Triggered by "Install" Button in Prefs to install systemd services
 * Run the following command asynchronously to copy systemd service, enable it and start it.
 * Only on successful execution, toggle the button "Remove". Following command are executed.
 *    # cp -f (current extension directory)/resources/mani-battery-health-charging-0|1
 *                                  /etc/systemd/system/mani-battery-health-charging.service
 *    # chmod 644 /etc/systemd/system/mani-battery-health-charging.service
 *    # systemctl enable mani-battery-health-charging.service
 *    # systemctl start mani-battery-health-charging.service
 */
function runInstaller() {
    let copyCmd = '';
    let addCmd = ' && ';
    let chmodCmd = 'chmod 644 /etc/systemd/system/mani-battery-health-charging.service';
    let sysCtlEnableCmd = 'systemctl enable mani-battery-health-charging.service';
    let sysCtlStartCmd = 'systemctl start mani-battery-health-charging.service';
    if (isBatteryCareLimitSupported()){
        copyCmd = `cp -f ${Me.dir.get_child('resources').get_child('mani-battery-health-charging-2').get_path()
        } /etc/systemd/system/mani-battery-health-charging.service`;
    }else if (isChargeStartThresholdSupported()) {
        copyCmd = `cp -f ${Me.dir.get_child('resources').get_child('mani-battery-health-charging-1').get_path()
        } /etc/systemd/system/mani-battery-health-charging.service`;
    } else {
        copyCmd = `cp -f ${Me.dir.get_child('resources').get_child('mani-battery-health-charging-0').get_path()
        } /etc/systemd/system/mani-battery-health-charging.service`;
    }

    let argv = [
        'pkexec',
        '/bin/sh',
        '-c',
        copyCmd + addCmd + chmodCmd + addCmd + sysCtlEnableCmd + addCmd + sysCtlStartCmd,
    ];
    try {
        const [, pid] = GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);

        GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {
            try {
                GLib.spawn_check_exit_status(status);
                ExtensionUtils.getSettings().set_boolean('install-service', true);
            } catch (e) {
                if (!e.code == 126)
                    logError(e);
            }
            GLib.spawn_close_pid(pid);
        });
    } catch (e) {
        logError(e);
    }
}

/**
 * Triggered by "Remove" Button in Prefs to install systemd services
 * Run the following command asynchronously to copy systemd service, enable it and start it.
 * Only on successful execution, toggle the button "Install".
 * Remove symlink instead of "systemctl disable service" as the command fails if for some reason
 * mani-battery-health-charging.service goes missing. This ensures cleaner removal of services since
 * we know exactly where the symlink resides.
 *  Following command are executed.
 *    # rm -f /etc/systemd/system/multi-user.target.wants/mani-battery-health-charging.service
 *    # rm -f /etc/systemd/system/mani-battery-health-charging.service
 *    # chmod 644 /etc/systemd/system/mani-battery-health-charging.service
 *    # systemctl daemon-reload
 *    # systemctl reset-failed
 */
function runUninstaller() {
    let addCmd = ' && ';
    let rmSymlimkCmd = 'rm -f /etc/systemd/system/multi-user.target.wants/mani-battery-health-charging.service';
    let rmCmd = 'rm -f /etc/systemd/system/mani-battery-health-charging.service';
    let sysctlReloadCmd = 'systemctl daemon-reload';
    let sysctlResetCmd = 'systemctl reset-failed';
    let uninstallCmd = rmSymlimkCmd + addCmd + rmCmd + addCmd + sysctlReloadCmd + addCmd + sysctlResetCmd;

    let argv = ['pkexec', '/bin/sh', '-c', uninstallCmd];
    try {
        const [, pid] = GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);

        GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {
            try {
                GLib.spawn_check_exit_status(status);
                ExtensionUtils.getSettings().set_boolean('install-service', false);
            } catch (e) {
                if (!e.code == 126)
                    logError(e);
            }
            GLib.spawn_close_pid(pid);
        });
    } catch (e) {
        logError(e);
    }
}
