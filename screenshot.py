#!/usr/bin/env python3
"""Simple screenshot utility using Selenium"""
import sys
import time

try:
    from selenium import webdriver
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service
except ImportError:
    print("Installing selenium...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "selenium", "--quiet"])
    from selenium import webdriver
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service

# Set up Firefox in headless mode
options = Options()
options.add_argument("--headless")
options.add_argument("--width=1920")
options.add_argument("--height=1080")

print("Starting Firefox...")
driver = webdriver.Firefox(options=options)

try:
    print("Navigating to http://localhost:8090...")
    driver.get("http://localhost:8090")
    
    # Wait for page to load
    time.sleep(2)
    
    # Take screenshot
    screenshot_path = "/home/granite900/Desktop/Neural Lab/screenshot.png"
    driver.save_screenshot(screenshot_path)
    print(f"Screenshot saved to: {screenshot_path}")
    
    # Get page title
    print(f"Page title: {driver.title}")
    
    # Check for key elements
    print("\nVerifying elements:")
    try:
        header = driver.find_element("tag name", "header")
        print("✓ Header found")
    except:
        print("✗ Header not found")
    
    try:
        logo = driver.find_element("css selector", ".logo h1")
        print(f"✓ Title found: {logo.text}")
    except:
        print("✗ Title not found")
    
    try:
        run_btn = driver.find_element("id", "btnRun")
        print("✓ Run button found")
    except:
        print("✗ Run button not found")
        
    try:
        palette = driver.find_element("id", "palette")
        print("✓ Palette sidebar found")
    except:
        print("✗ Palette sidebar not found")
    
    try:
        canvas_el = driver.find_element("id", "canvas")
        print("✓ Canvas found")
    except:
        print("✗ Canvas not found")
        
    try:
        output = driver.find_element("id", "outputNode")
        print("✓ Output node found")
    except:
        print("✗ Output node not found")

finally:
    driver.quit()
    print("\nDone!")
