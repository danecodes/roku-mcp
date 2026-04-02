sub Main(args as dynamic)
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)
    scene = screen.CreateScene("MainScene")

    ' Pass deep link params to scene
    if args <> invalid
        if args.contentId <> invalid and args.contentId <> ""
            scene.deepLinkContentId = args.contentId
            scene.deepLinkMediaType = args.mediaType
        end if
    end if

    screen.Show()

    while true
        msg = wait(0, m.port)
        if type(msg) = "roSGScreenEvent"
            if msg.isScreenClosed()
                return
            end if
        end if
    end while
end sub
