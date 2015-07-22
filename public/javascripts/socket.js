window.onload = function () {
    $("#frame").hide();
    var socket = io.connect();

    socket.on('show_image', function (data) {

        $("#frame").hide();
        $("#image").show();
        if (data.showMetadata == true)
            $(".metadata").show();
        else
            $(".metadata").hide();

        $("#imgroot")
            .attr("src", data.file)
            .imagesLoaded(function () {
                $("#imgroot")
                    .css({
                        position: 'absolute',
                        left: ($(window).width() - data.width) / 2,
                        top: ($(window).height() - data.height) / 2
                    });

                $(".metadata").html("File: " + data.file + "<br/>Keywords: " + data.keywords + "<br/>Rating: " + data.rating + "<br/>Date Taken: " + data.datetaken + "<br/>Size: " + data.width + "x" + data.height);
            });
    });

    socket.on('show_url', function (data) {

        $("#frame").show();
        $("#image").hide();

        $("#urlframe")
            .attr("src", data.url)
            .css({
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: $(window).height()
           });
    });


    $("#settings-dialog").dialog({
        autoOpen: false,
        width: 550,
        modal: true,
        buttons: {
            Cancel: function () {
                $(this).dialog("close");
            },
            OK: function () {

                var settings = getSettings($(this));

                $.ajax({
                    url: "/settings",
                    type: "POST",
                    contentType: 'application/json; charset=utf-8',
                    data: JSON.stringify({ settings: settings }),
                    success: function (matches) {
                        //$('#matches').html(matches.count + "/" + matches.totalCount);
                    }
                });



                $(this).dialog("close");
            },
            Apply: function () {

                var settings = getSettings($(this));

                $.ajax({ url: "/checksettings",
                    data: { settings: settings },
                    cache: false,
                    success: function (matches) {
                        $('#matches').html(matches.count + "/" + matches.totalCount);
                    }
                });
            }
        },
        close: function () {
            //alert('close')
        }
    });

    $(".settingsicon").on('click', function () {
        $.ajax({ url: "/settings",
            cache: false,
            success: function (settings) {
                var dialog = $("#settings-dialog");

                if (settings.rating == null)
                    settings.rating = 0;

                var minDate = new Date(settings.minDate);
                var maxDate = new Date(settings.maxDate);

                if (minDate)
                    dialog.find("#startdate").val(minDate.getMonth() + 1 + '/' + minDate.getDate() + '/' + minDate.getFullYear());
                if (maxDate)
                    dialog.find("#enddate").val(maxDate.getMonth() + 1 + '/' + maxDate.getDate() + '/' + maxDate.getFullYear());

                dialog.find('#timeoutDelay').val(settings.timeoutDelay);
                dialog.find('#keywords').val(settings.keywords);
                dialog.find(':radio[name="star1"][value=' + settings.rating + ']').rating("select", settings.rating - 1);
                dialog.find('#showmetadata').prop("checked", settings.showMetadata);

                dialog.dialog('open');
            }
        });
    });

    function split(val) {
        return val.split(/,\s*/);
    }

    function extractLast(term) {
        return split(term).pop();
    }

    function getValidDate(s) {
        var bits = s.split('/')
        var d = new Date(bits[2], bits[0] - 1, bits[1])
        if (d && (d.getMonth() + 1) == Number(bits[0]) && d.getDate() == Number(bits[1]))
            return d;
        else
            return null;
    }

    function getSettings(dialog) {
        var minDate = getValidDate(dialog.find("#startdate").val());
        var maxDate = getValidDate(dialog.find("#enddate").val());
        var keywords = dialog.find("#keywords").val().split(',');
        var rating = dialog.find(":radio[name='star1']:checked").val();
        var timeoutDelay = Number(dialog.find("#timeoutDelay").val());
        var showMetadata = dialog.find("#showmetadata").prop("checked");

        if (minDate)
            minDate = minDate.toISOString();

        if (maxDate)
            maxDate = maxDate.toISOString();

        return { minDate: minDate, maxDate: maxDate, keywords: keywords, rating: rating, timeoutDelay: timeoutDelay, showMetadata: showMetadata }
    }



    $("#keywords")
    // don't navigate away from the field on tab when selecting an item

      .bind("keydown", function (event) {
          if (event.keyCode === $.ui.keyCode.TAB &&
            $(this).data("ui-autocomplete").menu.active) {
              event.preventDefault();
          }
      })

      .autocomplete({
          source: function (request, response) {
              $.ajax({ url: "/keywords",
                  data: { term: extractLast(request.term) },
                  cache: false,
                  success: response
              });
          },

          search: function () {
              // custom minLength
              var term = extractLast(this.value);
              //if ( term.length < 2 ) {
              //  return false;
              //}
          },

          focus: function () {
              // prevent value inserted on focus
              return false;
          },

          select: function (event, ui) {
              var terms = split(this.value);

              // remove the current input
              terms.pop();

              // add the selected item
              terms.push(ui.item.value);

              // add placeholder to get the comma-and-space at the end
              terms.push("");
              this.value = terms.join(", ");
              return false;
          }
      });

    $("#startdate").datepicker();
    $("#enddate").datepicker();

}


