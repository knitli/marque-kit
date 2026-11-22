-- SPDX-FileCopyrightText: 2026 Knitli Inc.
-- SPDX-License-Identifier: AGPL-3.0-only

-- Run against a fresh, disposable file named by the test driver. Each read
-- opens the saved file again so the result reflects Word's current pagination.
on run argv
    set commandName to item 1 of argv
    set scratchPath to item 2 of argv
    set expectedName to (POSIX file scratchPath as text)
    set fixtureName to item 3 of argv
    set sourceLines to {"SECRET", "(U) Synthetic pagination test", "(S) Example text.", "Classified By: Example Reviewer", "Derived From: Example Guide", "Declassify On: 20450101", "(U) End of synthetic example.", "SECRET"}
    set AppleScript's text item delimiters to return
    set fixtureText to sourceLines as text
    set AppleScript's text item delimiters to ""
    tell application "Microsoft Word"
        -- Word may finish opening the scratch file after LaunchServices returns.
        repeat 150 times
            if exists document fixtureName then exit repeat
            delay 0.2
        end repeat
        if not (exists document fixtureName) then error "Word did not open the scratch document"
        set d to document fixtureName
        if (full name of d as text) is not expectedName then error "Unexpected document"
        try
            set actualText to content of text object of d
            if actualText is not (fixtureText & return) then error "Unexpected body text"
            if commandName is "split" then
                set page break before of paragraph 7 of d to false
                set page break before of paragraph 6 of d to true
                save d
                close d saving no
                return "saved"
            end if
            if commandName is not "read" then error "Unknown probe operation"
            repaginate d
            set fieldRows to {}
            repeat with i from 4 to 6
                set r to text object of paragraph i of d
                set lo to start of content of r
                -- Exclude the paragraph terminator from the field extent.
                set hi to (end of content of r) - 1
                set firstChar to create range d start lo end (lo + 1)
                set lastChar to create range d start (hi - 1) end hi
                set firstPage to get range information firstChar information type active end page number
                set lastPage to get range information lastChar information type active end page number
                set end of fieldRows to ((lo as text) & tab & (hi as text) & tab & firstPage & tab & lastPage)
            end repeat
            close d saving no
            set AppleScript's text item delimiters to linefeed
            return fieldRows as text
        on error failure number errno
            close d saving no
            error failure number errno
        end try
    end tell
end run
