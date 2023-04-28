#!/bin/bash

# Change working directory to project folder
cd "${0%/*}"

echo "Packing extension..."
gnome-extensions pack ./ \
    --extra-source=icons/ \
    --extra-source=resources/ \
    --extra-source=driver.js \
    --extra-source=preference.ui \
    --podir=po \
    --force \

echo "Installing extension..."
gnome-extensions install Battery-Health-Charging@qlala.github.com.shell-extension.zip --force

echo "Extension installed Battery Health Charging succesfully. Restart the shell (or logout) to be able to enable the extension."
