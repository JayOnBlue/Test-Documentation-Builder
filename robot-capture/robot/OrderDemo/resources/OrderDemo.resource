*** Settings ***
Documentation    Reusable keywords for capturing Order Management documentation screenshots.
...              Built on CumulusCI's SalesforcePlaywright library so steps are real
...              Salesforce UI interactions (App Launcher, tab navigation, record creation),
...              not just URL changes.
Library          Browser
Library          String
Library          Collections
Library          cumulusci.robotframework.CumulusCI
Library          ${CURDIR}/DocsCapture.py


*** Keywords ***
Set Doc Base Url
    [Documentation]    Remember the org's base URL (origin of the current page) for building record URLs.
    ${url}=          Get Url
    ${origin}=       Origin Of    ${url}
    Set Suite Variable    ${DOC_BASE}    ${origin}
    Log              Capture base URL: ${DOC_BASE}

Record Id For Object
    [Documentation]    Return the Id of one sample record for the object, via SOQL. Empty if none exist.
    [Arguments]      ${object}
    ${ok}    ${result}=    Run Keyword And Ignore Error    Soql Query    SELECT Id FROM ${object} LIMIT 1
    Return From Keyword If    '${ok}' == 'FAIL'    ${EMPTY}
    ${records}=      Set Variable    ${result}[records]
    ${count}=        Get Length    ${records}
    Return From Keyword If    ${count} == 0    ${EMPTY}
    RETURN           ${records}[0][Id]

Resolve Capture Url
    [Documentation]    Turn a manifest url_pattern into a full URL, resolving {recordId} via SOQL.
    [Arguments]      ${pattern}
    ${needs_id}=     Run Keyword And Return Status    Should Contain    ${pattern}    {recordId}
    Return From Keyword If    not ${needs_id}    ${DOC_BASE}${pattern}
    ${object}=       Object Api Name    ${pattern}
    ${rid}=          Record Id For Object    ${object}
    Return From Keyword If    '${rid}' == '${EMPTY}'    ${EMPTY}
    ${resolved}=     Replace String    ${pattern}    {recordId}    ${rid}
    RETURN           ${DOC_BASE}${resolved}

Capture Navigable Screenshot
    [Documentation]    Navigate to one manifest entry's page and save docs/images/<id>.png.
    [Arguments]      ${shot}    ${dir}
    ${id}=           Set Variable    ${shot}[id]
    ${pattern}=      Set Variable    ${shot}[url_pattern]
    ${url}=          Resolve Capture Url    ${pattern}
    IF    '${url}' == '${EMPTY}'
        Log          Skipping ${id} — no sample record for its object    WARN
        RETURN
    END
    Go To            ${url}
    Wait Until Loading Is Complete
    Sleep            1.5s
    Take Screenshot    filename=${dir}/${id}    fullPage=${False}
    Log              Captured ${id}

Open The App Launcher
    [Documentation]    Open the App Launcher panel. Uses the library keyword if present, else clicks the waffle icon.
    ${ok}=           Run Keyword And Return Status    Open App Launcher
    IF    not ${ok}
        ${clicked}=    Run Keyword And Return Status    Click    button[title="App Launcher"]
        IF    not ${clicked}
            Click    .slds-icon-waffle
        END
    END
    Wait For Elements State    input[placeholder*="Search apps"]    visible    timeout=20s

Show App Launcher Search
    [Documentation]    Open the App Launcher and type a search term (e.g. "Order Management"), then let it settle.
    [Arguments]      ${term}
    Open The App Launcher
    Fill Text        input[placeholder*="Search apps"]    ${term}
    Sleep            1.5s

Open App From Launcher
    [Documentation]    Open the App Launcher, search for an app by name, and click its tile to switch into it.
    [Arguments]      ${app_name}
    Show App Launcher Search    ${app_name}
    Click            a:has-text("${app_name}") >> nth=0
    Wait Until Loading Is Complete
    Sleep            1s

Open Tab From Navigation Bar
    [Documentation]    Click a tab by its visible label in the current app's navigation bar (e.g. "Orders").
    [Arguments]      ${tab_label}
    Click            one-app-nav-bar-item-container a:has-text("${tab_label}") >> nth=0
    Wait Until Loading Is Complete
    Sleep            1s

Capture Screenshot As
    [Documentation]    Save the current page as docs/images/<id>.png.
    [Arguments]      ${id}
    ${dir}=          Images Dir Path
    Take Screenshot    filename=${dir}/${id}    fullPage=${False}
    Log              Captured ${id}
